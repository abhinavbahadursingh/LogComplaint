import express from 'express'
import cors from 'cors'
import multer from 'multer'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const complaints = new Map()

/* ---------- In-memory heuristic "AI" extractor ---------- */

const ALIASES = {
  customer: 'customerName',
  company: 'customerName',
  product: 'productName',
  batch: 'batchNumber',
  'batch/lot': 'batchNumber',
  strength: 'productStrength',
  severity: 'severity',
  priority: 'priority',
  type: 'complaintType',
  'complaint type': 'complaintType'
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
}

function pad2(n) {
  return n > 0 && n < 10 ? `0${n}` : String(n)
}

function toISOYear(y) {
  const n = parseInt(y, 10)
  if (Number.isNaN(n)) return String(y)
  if (n >= 100) return String(n)
  return n >= 70 ? `19${String(n).padStart(2, '0')}` : `20${String(n).padStart(2, '0')}`
}

// Convert "10 June 2026", "June 10, 2026", "12/04/2026", "10-Jun-2026" to YYYY-MM-DD.
function toISODate(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return ''
  const mon = (m) => MONTHS[(m || '').slice(0, 3)] || 0
  let m
  if ((m = s.match(/^(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/))) {
    return `${toISOYear(m[3])}-${pad2(mon(m[2]))}-${pad2(+m[1])}`
  }
  if ((m = s.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
    return `${toISOYear(m[3])}-${pad2(mon(m[1]))}-${pad2(+m[2])}`
  }
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) {
    return `${toISOYear(m[3])}-${pad2(+m[2])}-${pad2(+m[1])}`
  }
  if ((m = s.match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/))) {
    return `${toISOYear(m[3])}-${pad2(mon(m[2]))}-${pad2(+m[1])}`
  }
  return s
}

const SOURCE_MAP = {
  email: 'Email',
  phone: 'Phone Call',
  portal: 'Portal / Web form',
  fax: 'Email',
  letter: 'Email',
  regulatory: 'Regulatory Body',
  distributor: 'Distributor',
  'field rep': 'Field Representative',
  'field-rep': 'Field Representative',
  fieldrep: 'Field Representative'
}

const TYPE_MAP = {
  appearance: 'Appearance / Visual Defect',
  packaging: 'Packaging Issue',
  labeling: 'Labeling Error',
  contamin: 'Contamination',
  microbial: 'Microbial Issue',
  stability: 'Storage / Stability Concern',
  storage: 'Storage / Stability Concern',
  dosage: 'Strength / Dosage Issue',
  effectiveness: 'Strength / Dosage Issue',
  quality: 'Other',
  other: 'Other'
}

// Words that indicate an actual reported defect/symptom, used to decide whether
// a description fragment from a chat edit is genuine.
const DEFECT_HINTS =
  /cracked|broken|moisture|discolor|discolou?r|contamin|foreign|leak|odor|odour|smell|deformed|split|spill|misshapen|headache|nausea|vomit|fever|rash|dizz|allerg|swelling|shortness|blurred|cough|irritat|stomach|pain|reaction|side effect|not effective|no effect|unable|difficulty|severe|deteriorat|damaged|missing|bent|swollen|expired|taste|colour|color/

const PRODUCT_STOP = new Set([
  'the', 'this', 'these', 'that', 'our', 'your', 'a', 'an', 'product', 'batch',
  'strength', 'approximately', 'about', 'around', 'total', 'after', 'from',
  'please', 'customer', 'complaint'
])

const DATE_SRC = '\\d{1,2}\\s+[a-z]{3,9}\\s+\\d{2,4}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|[a-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4}'

function extractFields(text) {
  const raw = text || ''
  const t = raw.toLowerCase()
  const fields = {}

  const grab = (regex, key) => {
    if (fields[key]) return
    const m = regex.exec(raw)
    if (m) {
      const val = m[m.length - 1] // last capture group holds the value
      if (val) fields[key] = val.trim()
    }
  }

  // ---- Customer / client / company ----
  grab(/(customer|client|company|reporter)\s*[:=\-]\s*([A-Z][\w.'-]+(?:[ \t]+[\w.'-]+){0,3})/i, 'customerName')
  if (!fields.customerName) {
    const m = raw.match(
      /\bcustomer\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?=\s+(?:reported|wrote|complained|stated|mentioned|submitted|notified|says|said|emailed|raised|logged|reports))/i
    )
    if (m) fields.customerName = m[1].trim()
  }
  if (!fields.customerName) {
    const m = raw.match(
      /(?<!product\s+)(?:the\s+)?(?:customer\s+)?name\s+(?:is|was|now|to|set\s+to|changed\s+to|changed|updated\s+to|corrected\s+to|revised\s+to|should\s+be)\s+([a-zA-Z][\w.'-]+(?:\s+[a-zA-Z][\w.'-]+){0,3})/i
    )
    if (m) fields.customerName = m[1].replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim()
  }

  // ---- Product name ----
  grab(/(?:product(?:\s*name)?)\s*[:=\-]\s*([A-Z][A-Za-z0-9 .+\/-]{3,60})/i, 'productName')
  if (!fields.productName) {
    const m = raw.match(/\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]+)*)\s+(\d+(?:\.\d+)?)\s?(mg|mcg|g|ml|iu|tablets?|capsules?|units?)\b/)
    if (m && !PRODUCT_STOP.has(m[1].split(/\s+/)[0].toLowerCase())) {
      fields.productName = `${m[1]} ${m[2]}${m[3]}`.trim()
    }
  }
  if (!fields.productName) {
    grab(/^product\s+([A-Z][A-Za-z0-9 .+\/-]{3,60})/i, 'productName')
  }
  if (!fields.productName) {
    const m = raw.match(
      /(?:product(?:\s+name)?|the\s+product)\s+(?:is|was|now|to|set\s+to|changed\s+to|changed|updated\s+to|corrected\s+to)\s+([a-zA-Z][A-Za-z0-9 .+\/-]{2,60})/i
    )
    if (m) fields.productName = m[1].replace(/^\s*[a-z]/, (c) => c.toUpperCase()).trim()
  }

  // ---- Batch / lot number ----
  grab(/(?:batch|lot)\s*(?:number)?\s*[:=\-]\s*([A-Za-z0-9-]{3,30})/i, 'batchNumber')
  if (!fields.batchNumber) {
    const m = raw.match(/\b(?:batch|lot)(?: number)?\s+([A-Za-z0-9]{1,6}(?:-[A-Za-z0-9]+)+)\b/i)
    if (m) fields.batchNumber = m[1].trim()
  }
  if (!fields.batchNumber) {
    const m = raw.match(/\b(?:batch|lot)(?:\s+number)?\s+(?:was\s+|has\s+been\s+|is\s+)?(?:changed|corrected|updated|set|revised|amended)?\s*to\s+([A-Za-z0-9-]{3,30})/i)
    if (m) fields.batchNumber = m[1].trim()
  }
  if (!fields.batchNumber) {
    const m = raw.match(/\b(?:batch|lot)\s+(?:number\s+)?(?:is|was|=|:)\s+(?:now\s+)?([A-Za-z0-9-]{3,30})/i)
    if (m) fields.batchNumber = m[1].trim()
  }

  // ---- Strength / grade ----
  grab(/(strength|grade)\s*[:=\-]\s*([0-9a-z/ .-]{1,20})/i, 'productStrength')
  if (!fields.productStrength) {
    const m = raw.match(
      /(?:strength|grade)\s+(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to)\s+([0-9a-z/ .-]{1,20})/i
    )
    if (m) fields.productStrength = m[1].trim()
  }

  // ---- Dates (labeled + natural language) ----
  const dateRules = [
    ['manufacturingDate', new RegExp(`(?:manufactur(?:ed|ing)?|mfg)\\s*(?:date)?\\s*(?:on|is|was|to|set\\s+to|:|=|-)?\\s*(${DATE_SRC})`, 'i')],
    ['expiryDate', new RegExp(`exp(?:iry|ires?|iration)?\\s*(?:date)?\\s*(?:on|is|was|to|set\\s+to|:|=|-)?\\s*(${DATE_SRC})`, 'i')],
    ['complaintDate', new RegExp(`complaint\\s*(?:date|was\\s*received|received|logged|filed|made|recorded|dated)?\\s*(?:on|is|was|to|set\\s+to|:|=|-)?\\s*(${DATE_SRC})`, 'i')]
  ]
  dateRules.forEach(([key, re]) => {
    const m = re.exec(t)
    if (m && m[1]) fields[key] = toISODate(m[1])
  })

  // ---- Quantity affected ----
  grab(/(?:quantity|qty)\s*[:=\-]\s*(\d+(?:\.\d+)?)/i, 'quantityAffected')
  if (!fields.quantityAffected) {
    const qm = t.match(/\b(?:approximately|about|approx\.?|around|total|over|up\s*to|~)?\s*(\d+(?:\.\d+)?)\s+(?:packs?|units?|tablets?|bottles?|vials?|cartons?|boxes?|blisters?|blister\s*packs?|cases?|pieces?|pcs|sachets?|kg)\b/)
    if (qm) fields.quantityAffected = qm[1]
  }
  if (!fields.quantityAffected) {
    const q2 = t.match(/quantity\s+affected\s+(?:is|was|=|:)\s*(\d+)/)
    if (q2) fields.quantityAffected = q2[1]
  }
  if (!fields.quantityAffected) {
    const m = raw.match(
      /(?:quantity\s+affected|quantity|qty)\s+(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to)\s+(\d+(?:\.\d+)?)/i
    )
    if (m) fields.quantityAffected = m[1].trim()
  }

  // ---- Complaint source ----
  const src = t.match(
    /(?:\[|\()(email|phone|portal|fax|regulatory|distributor|field[ -]?rep)(?:\]|\))|(?:source|via)\s*(?:was|is|of|by|:|=|-)?\s*(email|phone|portal|fax|letter|regulatory|distributor|field[ -]?rep)/
  )
  if (src) {
    const key = (src[1] || src[2] || '').trim()
    fields.complaintSource = SOURCE_MAP[key] || SOURCE_MAP[key.replace(/\s+/g, '-')]
    if (!fields.complaintSource) delete fields.complaintSource
  }
  if (!fields.complaintSource) {
    const em = raw.match(
      /(?:complaint\s+source|source)\s+(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to)\s+(email|phone|portal|fax|letter|regulatory|distributor|field\s+rep)/i
    )
    if (em) {
      const key = em[1].trim().replace(/\s+/g, '-')
      fields.complaintSource = SOURCE_MAP[key] || SOURCE_MAP[key.replace('-rep', 'rep')]
      if (!fields.complaintSource) delete fields.complaintSource
    }
  }

  // ---- Severity ----
  const sev = t.match(
    /(?:severity)\s*(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to|became|made)?\s*[:=\-]?\s*(critical|high|severe|medium|moderate|low|minor)\b|(critical|high|severe|medium|moderate|low|minor)\s+severity\b/
  )
  if (sev) {
    const lvl = (sev[1] || sev[2] || '').toLowerCase()
    fields.severity = /crit/.test(lvl)
      ? 'Critical — Immediate recall consideration'
      : /high|severe/.test(lvl)
        ? 'High — Potential safety / regulatory concern'
        : /medium|moderate/.test(lvl)
          ? 'Medium — Moderate, localized impact'
          : 'Low — Minor cosmetic issue'
  }

  // ---- Priority ----
  const pri = t.match(
    /(?:priority)\s*(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to|became|made)?\s*[:=\-]?\s*(urgent|critical|high|normal|medium|low)\b|(urgent|critical|high|normal|medium|low)\s+priority\b/
  )
  if (pri) {
    const lvl = (pri[1] || pri[2] || '').toLowerCase()
    fields.priority = /urgent|critical/.test(lvl)
      ? 'Urgent'
      : /high/.test(lvl)
        ? 'High'
        : /normal|medium/.test(lvl)
          ? 'Normal'
          : 'Low'
  }

  // ---- Complaint type ----
  const ct = t.match(/(appearance|packaging|labeling|contamin|microbial|stability|storage|dosage|effectiveness|quality|other)(?:\s*(?:issue|problem|concern|defect|complaint))?/)
  if (ct) fields.complaintType = TYPE_MAP[ct[1]]
  if (!fields.complaintType) {
    const tm = raw.match(
      /(?:complaint\s+type|type)\s+(?:is|was|now|to|set\s+to|changed\s+to|updated\s+to)\s+([a-z][a-z ]{2,40})/i
    )
    if (tm) {
      const phrase = tm[1].trim().toLowerCase()
      const hit = Object.keys(TYPE_MAP).find((k) => phrase.includes(k))
      fields.complaintType = hit ? TYPE_MAP[hit] : tm[1].trim()
    }
  }

  // ---- Description (sentence containing the reported defect / symptom) ----
  const rawSentences = raw.split(/(?<=[.!?])\s+/)
  const sentences = t.split(/(?<=[.!?])\s+/)
  const descIdx = sentences.findIndex((s) =>
    /cracked|broken|moisture|discolor|discolou?r|contamin|foreign|leak|odor|odour|smell|deformed|split|spill|misshapen|headache|nausea|vomit|fever|rash|dizz|allerg|swelling|shortness|blurred|cough|irritat|stomach|pain|reaction|side effect|not effective|no effect|unable|difficulty|severe|deteriorat/.test(s)
  )
  if (descIdx >= 0) {
    fields.description = (rawSentences[descIdx] || '').trim()
  } else {
    const defect = t.match(
      /(?:found|observed|noticed|reported|complaint|issue|problem)[^\n]{2,200}|[^\n]*(?:cracked|broken|moisture|discolor|discolou?r|contamin|foreign|leak|odor|odour|smell|deformed|split|spill)[^\n]*/
    )
    if (defect) fields.description = defect[0].trim()
  }

  return fields
}

// Only treat a chat message as complaint data when it actually carries fields —
// plain questions ("what is the severity?") should stay conversational. Single
// fields still count: an edit like "set priority to High" must update the form,
// and a genuine defect description ("update the description: cracked tablets")
// is also an edit.
function looksLikeComplaintData(fields) {
  const keys = Object.keys(fields || {})
  if (!keys.length) return false
  if (['customerName', 'productName', 'batchNumber'].some((k) => fields[k])) return true
  if (fields.description && DEFECT_HINTS.test(fields.description)) return true
  const substantive = keys.filter((k) => fields[k] && k !== 'description')
  return substantive.length >= 1
}

/* ---------- Lightweight PDF text extraction (no external deps) ---------- */

function decodePdfLiteral(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      const n = s[++i]
      if (n === 'n') out += '\n'
      else if (n === 'r') out += '\r'
      else if (n === 't') out += '\t'
      else if (n === 'b') out += '\b'
      else if (n === 'f') out += '\f'
      else if (n === '(') out += '('
      else if (n === ')') out += ')'
      else if (n === '\\') out += '\\'
      else if (n !== undefined && /\d/.test(n)) {
        let oct = n
        for (let j = 0; j < 2 && /\d/.test(s[i + 1] || ''); j++) oct += s[++i]
        out += String.fromCharCode(parseInt(oct, 8))
      } else if (n !== undefined) out += n
    } else out += c
  }
  return out
}

function decodePdfHex(s) {
  const hex = (s || '').replace(/\s+/g, '')
  let out = ''
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  }
  return out
}

function extractTextOperators(content) {
  const text = []
  const re = /\((\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\[[\s\S]*?\]|([A-Za-z*]+)/g
  const arrRe = /\((\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>/g
  let pending = []
  let m
  const flush = () => {
    if (pending.length) {
      text.push(pending.join('').replace(/\s+/g, ' ').trim())
      pending = []
    }
  }
  while ((m = re.exec(content))) {
    const tok = m[0]
    const op = m[2]
    if (tok[0] === '(') {
      pending.push(decodePdfLiteral(tok.slice(1, -1)))
    } else if (tok[0] === '<' && tok[1] !== '<') {
      pending.push(decodePdfHex(tok.slice(1, -1)))
    } else if (tok[0] === '[') {
      const arr = []
      let am
      while ((am = arrRe.exec(tok))) {
        const t2 = am[0]
        arr.push(t2[0] === '(' ? decodePdfLiteral(t2.slice(1, -1)) : decodePdfHex(t2.slice(1, -1)))
      }
      pending.push(arr.join(''))
    } else if (op === 'Tj' || op === 'TJ') {
      flush()
    } else if (/^T\*$|^T[dD]$/.test(op) || op === 'ET') {
      flush()
    }
  }
  flush()
  return text.join('\n')
}

function extractPdfText(buf) {
  const raw = buf.toString('latin1')
  const out = []
  const streamRe = /(\d+\s+\d+\s+obj[\s\S]*?)stream\r?\n([\s\S]*?)\r?\nendstream/g
  let sm
  while ((sm = streamRe.exec(raw))) {
    const header = sm[1]
    let content = sm[2]
    if (/FlateDecode/.test(header)) {
      try {
        content = zlib.inflateSync(Buffer.from(content, 'latin1')).toString('latin1')
      } catch {
        continue
      }
    }
    const txt = extractTextOperators(content)
    if (txt) out.push(txt)
  }
  return out.join('\n').trim()
}

function extractTextFromFile(file) {
  const ext = (file?.originalname || '').split('.').pop()?.toLowerCase()
  if (ext === 'txt') return file.buffer.toString('utf8')
  if (ext === 'pdf') return extractPdfText(file.buffer)
  // DOCX/EML still fall back to a canned sample document for this demo.
  return [
    'Customer: Acme Pharmaceuticals',
    'Product: Paracetamol 500mg Tablets',
    'Batch/Lot Number: B24XR-0087',
    'Strength: 500 mg / USP Grade',
    'Manufacturing Date: 12/04/2026',
    'Expiry Date: 11/04/2028',
    'Quantity: 6',
    'Complaint Date: 08/08/2026',
    'Complaint Type: Packaging Issue',
    'Severity: Medium',
    'Two tablets inside the blister were found cracked on opening the pack. Packaging shows signs of moisture ingress.',
    '(email) reported by the regional distributor.'
  ].join('\n')
}

/* ---------- Heuristic risk assessment ---------- */

const RISK_CRITICAL = /contamin|microbial|foreign|recall|safety|life.?threat|allerg|child|infant|steril|leak|burst|tamper|poison|toxic|blood/
const RISK_HIGH = /cracked|crack|moisture|dosage|strength|potenc|wrong|mislabel|labeling|missing|broken|split|discolor|discolou?r|color change|smell|odor|odour|deform|spill/
const RISK_MEDIUM = /packaging|appearance|cosmetic|visual|dented|scratch|residue|sticky|seal|container/

const RISK_ACTIONS = {
  'Critical — Immediate recall consideration':
    'Quarantine all affected batch inventory immediately, initiate CAPA, and evaluate regulatory notification (recall / field alert) within 4 hours.',
  'High — Potential safety / regulatory concern':
    'Place the batch on quality hold, open a CAPA, and run a root-cause investigation before releasing any further stock.',
  'Medium — Moderate, localized impact':
    'Open a complaint investigation, trend the batch, and disposition based on the investigation outcome and impact assessment.',
  'Low — Minor cosmetic issue':
    'Log for monitoring and document the outcome; escalate to corrective action only if a trend or repeat pattern emerges.'
}

function assessRisk(fields = {}) {
  const text = [
    fields.complaintType,
    fields.description,
    fields.productName,
    fields.severity,
    fields.priority
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const stated = (fields.severity || '').toLowerCase()
  const qty = parseFloat(String(fields.quantityAffected || '').replace(/[^\d.]/g, '')) || 0

  let severity = 'Low — Minor cosmetic issue'
  if (/critical|recall/i.test(stated) || RISK_CRITICAL.test(text)) {
    severity = 'Critical — Immediate recall consideration'
  } else if (/high|safety/i.test(stated) || RISK_HIGH.test(text)) {
    severity = 'High — Potential safety / regulatory concern'
  } else if (/medium|moderate/i.test(stated) || RISK_MEDIUM.test(text)) {
    severity = 'Medium — Moderate, localized impact'
  }

  if (qty >= 10 && severity === 'Low — Minor cosmetic issue') {
    severity = 'Medium — Moderate, localized impact'
  }

  const nextAction = RISK_ACTIONS[severity]
  const level = severity.split('—')[0].trim().toLowerCase()

  const customer = fields.customerName || 'the reporting customer'
  const product = fields.productName || 'the affected product'
  const batch = fields.batchNumber ? ` (batch ${fields.batchNumber})` : ''
  const type = fields.complaintType ? fields.complaintType.toLowerCase() : 'reported defect'

  const assessment = `Complaint received from ${customer} regarding ${product}${batch}, classified as ${type}. Based on the reported condition, the risk level is assessed as ${level}. Recommended action: ${nextAction}${
    qty > 0 ? ` Affected quantity on record: ${fields.quantityAffected}.` : ''
  }`

  return { severity, nextAction, assessment }
}

/* ---------- Routes ---------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'customer-complaint', at: new Date().toISOString() })
})

app.post('/api/complaints', (req, res) => {
  const body = req.body || {}
  if (!body.customerName || !body.productName || !body.batchNumber) {
    return res.status(400).json({ error: 'customerName, productName and batchNumber are required.' })
  }
  const id = crypto.randomUUID()
  complaints.set(id, { ...body, id, createdAt: new Date().toISOString(), status: 'pending_triage' })
  res.status(201).json({ id, status: 'pending_triage', message: 'Complaint saved.' })
})

app.get('/api/complaints', (_req, res) => {
  res.json({ complaints: [...complaints.values()] })
})

app.post('/api/ai/extract', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided (multipart key "file").' })
  const text = extractTextFromFile(req.file)
  const fields = extractFields(text)
  const count = Object.keys(fields).filter((k) => fields[k]).length
  console.log(`[extract] file=${req.file.originalname} size=${req.file.size} textLen=${text.length} fields=${count}`)
  res.json({ fileName: req.file.originalname, text, fields })
})

app.post('/api/ai/risk-assessment', (req, res) => {
  const fields = req.body?.fields || {}
  res.json(assessRisk(fields))
})

app.post('/api/ai/chat', (req, res) => {
  const { message, context } = req.body || {}
  const form = context?.form || {}
  const extracted = context?.extracted || {}
  const msg = (message || '').toLowerCase()
  const q = msg[0]

  // If the user pastes raw complaint text, extract fields so the form can be
  // populated automatically (same extractor the document pipeline uses).
  // Questions ("what is the severity?", "is the batch PCM-2026-081?") are never
  // treated as form edits, even if a field word happens to appear in them.
  const chatExtracted = extractFields(message || '')
  const isQuestion =
    /\?\s*$/.test(msg.trim()) ||
    /^(what|how|why|who|when|which|where|can|could|is|are|do|does|should|would|please)\b/.test(msg.trim())
  const extractedPayload = !isQuestion && looksLikeComplaintData(chatExtracted) ? chatExtracted : undefined

  // "Latest" view = previously extracted + form + anything just extracted, so
  // replies and auto-assessment always reflect the most recently given details.
  const latest = { ...extracted, ...form, ...(extractedPayload || {}) }
  const mention = latest.productName
  const batch = latest.batchNumber
  const customer = latest.customerName
  const severity = latest.severity
  const priority = latest.priority

  let reply
  if (extractedPayload) {
    // Complaint details were given (pasted/updated) -> fill the form now and
    // confirm. Auto-assess any missing severity/priority so the intake is
    // complete before saving.
    const isEdit = Boolean(form.customerName || form.productName || form.batchNumber)
    const assessment = assessRisk(latest)
    const payload = { ...extractedPayload }
    // Only auto-assess fields the form does not already carry, so an edit to a
    // single detail never clobbers the existing severity/priority/assessment.
    if (!payload.severity && !form.severity) payload.severity = assessment.severity
    if (!payload.priority && !form.priority) payload.priority = assessment.priority
    if (!isEdit && !payload.recommendation && !form.aiSummary) {
      payload.recommendation = assessment.nextAction
    }
    // An edit should never overwrite the description with a stray fragment
    // (e.g. "set the complaint date to 15 August 2026" matching the fallback).
    if (isEdit && payload.description) {
      if (!DEFECT_HINTS.test(payload.description)) {
        delete payload.description
      } else {
        // Strip an instruction prefix ("update the description: ...") so only
        // the actual described defect is written to the form.
        payload.description = payload.description
          .replace(/^\s*(?:please\s+)?(?:update|set|change|edit|make|revise)\s+(?:the\s+)?description\s*(?:to|:|-|=)\s*/i, '')
          .trim()
      }
    }

    const detailParts = []
    if (payload.customerName) detailParts.push(`customer "${payload.customerName}"`)
    if (payload.productName) detailParts.push(`product "${payload.productName}"`)
    if (payload.batchNumber) detailParts.push(`batch ${payload.batchNumber}`)
    if (payload.productStrength) detailParts.push(`strength "${payload.productStrength}"`)
    if (payload.complaintType) detailParts.push(`type "${payload.complaintType}"`)
    if (payload.complaintSource) detailParts.push(`source "${payload.complaintSource}"`)
    if (payload.quantityAffected) detailParts.push(`quantity ${payload.quantityAffected}`)
    if (payload.manufacturingDate) detailParts.push(`mfg date ${payload.manufacturingDate}`)
    if (payload.expiryDate) detailParts.push(`expiry ${payload.expiryDate}`)
    if (payload.complaintDate) detailParts.push(`complaint date ${payload.complaintDate}`)
    if (isEdit) {
      if (payload.severity) detailParts.push(`severity "${payload.severity}"`)
      if (payload.priority) detailParts.push(`priority "${payload.priority}"`)
      if (payload.description) detailParts.push(`description "${payload.description}"`)
    }

    reply = `I ${isEdit ? 'updated the complaint with' : 'extracted'} the following details and filled the form: ${
      detailParts.join('; ') || 'no structured fields found'
    }.`
    if (!isEdit) {
      if (payload.severity) reply += ` Initial severity: ${payload.severity}.`
      if (payload.priority) reply += ` Priority: ${payload.priority}.`
    }
    reply += ' Review the form on the left, then save to begin triage.'
    return res.json({ reply, extracted: payload })
  }

  if (/summary|summar/.test(msg) || (q && /what|tell/.test(msg))) {
    reply = `Summary of this complaint: customer "${customer || 'Unknown'}", product "${mention || 'Unknown'}"${batch ? `, batch ${batch}` : ''}. Severity: ${severity || 'not set'}. Next step is to confirm the details on the left and save to begin triage.`
  } else if (/severity|urgent|priority|triag/.test(msg)) {
    const fast = /urgent|critical|high/i.test(priority || '') || /high|crit/i.test(severity || '') || /urgen/i.test(severity || '')
    reply = `Based on the current details, severity is "${severity || 'not yet assessed'}". Recommended priority: ${
      priority
        ? `${priority === 'Urgent' || priority === 'High' ? 'High — review within 4 hours' : 'Normal — review within 24 hours'}`
        : fast
          ? 'High — review within 4 hours'
          : 'Normal — review within 24 hours'
    } for ${customer || 'this customer'}.`
  } else if (/batch|lot/.test(msg)) {
    reply = `The batch/lot on record is "${batch || 'not captured yet'}". If batch "${batch || '…'}" is implicated, consider a hold-and-test and check release results before dispositioning.`
  } else if (/product|batch.*issue|cause/.test(msg)) {
    reply = `For "${mention || 'the product'}" the typical root causes are raw-material variance, process deviation, or handling/storage issues. Recommend a complaint investigation and CAPA intake for confirmation.`
  } else if (/customer|who/.test(msg)) {
    reply = `The complaint was logged for "${customer || 'a customer not yet identified'}"${mention ? ` regarding ${mention}` : ''}.`
  } else {
    reply = `I don't have enough info to fully answer that yet. Try asking for a summary, severity/triage guidance, or batch-specific investigation steps.`
  }

  res.json({ reply, ...(extractedPayload ? { extracted: extractedPayload } : {}) })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})