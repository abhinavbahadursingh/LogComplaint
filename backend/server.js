import express from 'express'
import cors from 'cors'
import multer from 'multer'
import crypto from 'node:crypto'

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

function extractFields(text) {
  const t = (text || '').toLowerCase()
  const fields = {}

  const grab = (regex, key) => {
    const m = regex.exec(t)
    if (m && m[1]) fields[key] = m[1].trim()
  }

  grab(/(customer|client|company)\s*[:=\-]\s*([a-z0-9 ]{3,60})/i, 'customerName')
  grab(/product(?:\s*name)?\s*[:=\-]\s*([a-z0-9 ]{3,60})/i, 'productName')
  grab(/(?:batch|lot)\s*(?:number)?\s*[:=\-]\s*([a-z0-9-]{3,30})/i, 'batchNumber')
  grab(/(strength|grade)\s*[:=\-]\s*([0-9a-z/ .-]{1,20})/i, 'productStrength')
  grab(/(quantity|qty)\s*[:=\-]\s*(\d+(?:\.\d+)?)/i, 'quantityAffected')
  grab(/(manufactur(?:ed|ing)?|mfg)\s*date\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i, 'manufacturingDate')
  grab(/exp(?:ir)?y?\s*date\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i, 'expiryDate')
  grab(/complaint\s*(?:date)?\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i, 'complaintDate')

  if (/severity\s*[:=\-]\s*(\w+)/i.test(t)) {
    const level = RegExp.$1.toLowerCase()
    fields.severity = /crit|high/.test(level)
      ? 'High — Potential safety / regulatory concern'
      : /medium|moderate/.test(level)
        ? 'Medium — Moderate, localized impact'
        : /low/.test(level)
          ? 'Low — Minor cosmetic issue'
          : undefined
    if (!fields.severity) delete fields.severity
  }

  const complaintType = t.match(
    /(appearance|packaging|labeling|contamin|microbial|stability|storage|dosage|effectiveness|other)(?:\s*(issue|problem|concern))?/
  )
  if (complaintType) {
    const map = {
      appearance: 'Appearance / Visual Defect',
      packaging: 'Packaging Issue',
      labeling: 'Labeling Error',
      contamin: 'Contamination',
      microbial: 'Microbial Issue',
      stability: 'Storage / Stability Concern',
      storage: 'Storage / Stability Concern',
      dosage: 'Strength / Dosage Issue',
      effectiveness: 'Strength / Dosage Issue',
      other: 'Other'
    }
    fields.complaintType = map[complaintType[1]]
  }

  // Source: detect where the complaint came from.
  const source = t.match(/(\[|\()(email|phone|portal|fax|regulatory|distributor|field[ -]?rep)(\]|\))/)
  const sourceMap = {
    email: 'Email',
    phone: 'Phone Call',
    portal: 'Portal / Web form',
    fax: 'Email',
    regulatory: 'Regulatory Body',
    distributor: 'Distributor',
    'field rep': 'Field Representative',
    'field-rep': 'Field Representative',
    fieldrep: 'Field Representative'
  }
  if (source) fields.complaintSource = sourceMap[source[2]]

  return fields
}

function extractTextFromFile(file) {
  const ext = (file?.originalname || '').split('.').pop()?.toLowerCase()
  if (ext === 'txt') return file.buffer.toString('utf8')
  // For PDF/DOCX/EML in this demo we return a canned sample document so the
  // pipeline is fully exercised end-to-end. Wire a real parser here in production.
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
  res.json({ fileName: req.file.originalname, text, fields })
})

app.post('/api/ai/chat', (req, res) => {
  const { message, context } = req.body || {}
  const form = context?.form || {}
  const extracted = context?.extracted || {}
  const msg = (message || '').toLowerCase()
  const q = msg[0]

  const mention = form.productName || extracted.productName
  const batch = form.batchNumber || extracted.batchNumber
  const customer = form.customerName || extracted.customerName
  const severity = form.severity || extracted.severity

  let reply
  if (/summary|summar/.test(msg) || (q && /what|tell/.test(msg))) {
    reply = `Summary of this complaint: customer "${customer || 'Unknown'}", product "${mention || 'Unknown'}"${batch ? `, batch ${batch}` : ''}. Severity: ${severity || 'not set'}. Next step is to confirm the details on the left and save to begin triage.`
  } else if (/severity|urgent|priority|triag/.test(msg)) {
    reply = `Based on the current details, severity is "${severity || 'not yet assessed'}". Recommended priority: ${/high|crit/i.test(severity || '') || /urgen/i.test(severity || '') ? 'High — review within 4 hours' : 'Normal — review within 24 hours'} for ${customer || 'this customer'}.`
  } else if (/batch|lot/.test(msg)) {
    reply = `The batch/lot on record is "${batch || 'not captured yet'}". If batch "${batch || '…'}" is implicated, consider a hold-and-test and check release results before dispositioning.`
  } else if (/product|batch.*issue|cause/.test(msg)) {
    reply = `For "${mention || 'the product'}" the typical root causes are raw-material variance, process deviation, or handling/storage issues. Recommend a complaint investigation and CAPA intake for confirmation.`
  } else if (/customer|who/.test(msg)) {
    reply = `The complaint was logged for "${customer || 'a customer not yet identified'}"${mention ? ` regarding ${mention}` : ''}.`
  } else {
    reply = `I don't have enough info to fully answer that yet. Try asking for a summary, severity/triage guidance, or batch-specific investigation steps.`
  }

  res.json({ reply })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})