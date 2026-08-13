# 5. Backend Design — Express (Active)

> [Back to index](README.md)

This document is the complete technical reference for `backend/server.js` — the Express API that actually runs the system. It covers setup, every heuristic engine, PDF parsing, and every route.

---

## 5.1 Server bootstrap

```js
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())                                  // open CORS for development
app.use(express.json({ limit: '2mb' }))          // JSON body limit

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } })

const complaints = new Map()                     // in-memory ledger
```

Key facts:
- Single-file backend (≈1020 lines), ESM.
- **No LLM dependencies** — the "AI" is deterministic regex + keyword logic.
- Uploads are held in memory (max 10 MB), then parsed.
- The complaints ledger is an in-memory `Map` (resets on restart).

---

## 5.2 Shared lookup tables

| Constant | Purpose |
| --- | --- |
| `MONTHS` | Month-name → number for date parsing |
| `SOURCE_MAP` | source keyword → canonical label (`email → "Email"`, `portal → "Portal / Web form"`, …) |
| `TYPE_MAP` | type keyword → canonical label (`packaging → "Packaging Issue"`, `contamin → "Contamination"`, …) |
| `DEFECT_HINTS` | regex of defect/symptom words used to decide if a description is genuine |
| `PRODUCT_STOP` | stop-words that can't start a product name (`the`, `product`, `batch`, …) |

---

## 5.3 Field extractor — `extractFields(text)`

`extractFields` runs a cascade of regex rules against the raw text. For each field it tries several patterns in order, always reading the **last capture group** as the value (`m[m.length - 1]`).

```
 raw text ──▶ customerName ──▶ productName ──▶ batchNumber ──▶ productStrength
                │                 │                │                │
                ▼                 ▼                ▼                ▼
       dates ───▶ quantityAffected ──▶ source ──▶ severity ──▶ priority
                │                                        │
                ▼                                        ▼
       complaintType  ◀──────────────────────── description
```

### Rules per field

| Field | Patterns (first match wins) |
| --- | --- |
| `customerName` | `customer/client/company/reporter: <Name>`; `<Name> reported/wrote/complained/…`; `name is/was/set to/changed to … <Name>` |
| `productName` | `product: <Name>`; `<Brand> <n><mg|mcg|g|ml|iu|tablets…>` (e.g. `Paracetamol 500mg Tablets`); `product is …` |
| `batchNumber` | `batch/lot: <code>`; `batch number <ABC-123>`; `batch changed/updated to <code>`; `batch is/was = : <code>` |
| `productStrength` | `strength/grade: <value>`; `strength is/was … <value>` |
| `manufacturingDate` | `manufacturing/mfg (date)? (on|is|was|:|=|-)? <date>` |
| `expiryDate` | `expiry/expires/expiration (date)? … <date>` |
| `complaintDate` | `complaint (date|was received|received|logged|filed|made|recorded|dated)? … <date>` |
| `quantityAffected` | `quantity/qty: <n>`; `(approximately|about|total|over|up to) <n> (units|tablets|packs|bottles|…)`; `quantity affected is <n>` |
| `complaintSource` | `[email]` / `(phone)` / `via <source>` / `source: <source>` → `SOURCE_MAP` |
| `severity` | `severity (is|was|:|=)? <level>` or `<level> severity` → canonical label |
| `priority` | `priority (is|was|:|=)? <level>` or `<level> priority` → `Low|Normal|High|Urgent` |
| `complaintType` | first keyword hit from `TYPE_MAP` |
| `description` | the sentence containing a `DEFECT_HINTS` keyword (e.g. "cracked", "moisture", "contamin") |

Dates are normalized with `toISODate` (see §3.6) — `"10 June 2026"`, `"June 10, 2026"`, `"12/04/2026"`, `"10-Jun-2026"` all become `YYYY-MM-DD`.

### `looksLikeComplaintData(fields)` — the question guard

Determines whether extracted fields are *real complaint data* (which should update the form) or just a question:

```js
function looksLikeComplaintData(fields) {
  const keys = Object.keys(fields || {})
  if (!keys.length) return false
  if (['customerName','productName','batchNumber'].some(k => fields[k])) return true   // core id fields
  if (fields.description && DEFECT_HINTS.test(fields.description)) return true          // genuine defect
  return keys.filter(k => fields[k] && k !== 'description').length >= 1                // ≥1 substantive field
}
```

---

## 5.4 PDF text extraction (zero external dependencies)

PDF parsing is implemented from scratch using Node's `zlib`:

```
 PDF bytes (latin1 string)
     │
     ▼  extractPdfText(buf)
 ┌──────────────────────────────────────────────────────┐
 │ 1. Regex scan for objects:                           │
 │      /(\d+\s+\d+\s+obj[\s\S]*?)stream\r?\n([\s\S]*?)\r?\nendstream/g
 │    → collect each stream's header + content          │
 │ 2. If header contains "FlateDecode":                 │
 │      content = zlib.inflateSync(Buffer.from(content,'latin1'))
 │      (skip stream on failure)                        │
 │ 3. For each stream: extractTextOperators(content)    │
 └──────────────────────────────────────────────────────┘
     │
     ▼  extractTextOperators(content)
 tokenise:  ( ... ) literal string
            < hex >  hex string
            [ ... ]  array
            <op>     operator (Tj, TJ, T*, Td, TD, ET, …)
     │
     ├─ '(' → decodePdfLiteral (handles \n \r \t \b \f ( ) \\ \ddd octal)
     ├─ '<…>' → decodePdfHex
     ├─ '[' array → decode each literal/hex element and concatenate
     └─ on Tj/TJ or T*/Td/TD/ET → FLUSH current line
     │
     ▼  lines joined with "\n"
```

> **Why line-flushing matters:** each `Tj`/`Td` in a PDF content stream usually emits a chunk of text. Flushing on those operators keeps "Product: Paracetamol…" and "Batch: B24XR-0087" on **separate lines**, which is exactly what the regex extractor needs. (This replaced an earlier capture-group bug that made `extractTextOperators` misread tokens.)

Verified inputs: both uncompressed and FlateDecode-compressed PDFs yield **all 11 fields** from the reference complaint.

---

## 5.5 File-type dispatch — `extractTextFromFile(file)`

| Extension | Behavior |
| --- | --- |
| `.txt` | `file.buffer.toString('utf8')` — real parsing (also used by the paste feature) |
| `.pdf` | `extractPdfText(file.buffer)` — real parsing |
| `.docx` | **canned sample** complaint text (demo) |
| `.eml` | **canned sample** complaint text (demo) |

The canned sample:

```
Customer: Acme Pharmaceuticals
Product: Paracetamol 500mg Tablets
Batch/Lot Number: B24XR-0087
Strength: 500 mg / USP Grade
Manufacturing Date: 12/04/2026
Expiry Date: 11/04/2028
Quantity: 6
Complaint Date: 08/08/2026
Complaint Type: Packaging Issue
Severity: Medium
Two tablets inside the blister were found cracked on opening the pack. Packaging shows signs of moisture ingress.
(email) reported by the regional distributor.
```

---

## 5.6 Risk assessment — `assessRisk(fields)`

### Keyword gates

| Level | Signals (regex on type + description + product + severity) |
| --- | --- |
| **Critical** | `contamin|microbial|foreign|recall|safety|life.?threat|allerg|child|infant|steril|leak|burst|tamper|poison|toxic|blood` |
| **High** | `cracked|crack|moisture|dosage|strength|potenc|wrong|mislabel|labeling|missing|broken|split|discolor|color change|smell|odor|deform|spill` |
| **Medium** | `packaging|appearance|cosmetic|visual|dented|scratch|residue|sticky|seal|container` |

Scoring order: stated severity (`critical|recall` first, then `high|safety`, then `medium|moderate`) → text keyword gates. A stated `critical`/`high`/`medium` severity **overrides** the keyword level. Quantity `≥ 10` bumps a Low to Medium.

### Output

```js
{
  severity: "High — Potential safety / regulatory concern",
  nextAction: "Place the batch on quality hold, open a CAPA, and run a root-cause investigation before releasing any further stock.",
  assessment: "Complaint received from <customer> regarding <product> (batch <batch>), classified as <type>. Based on the reported condition, the risk level is assessed as <level>. Recommended action: <nextAction>…"
}
```

`RISK_ACTIONS` provides the per-severity next-action text.

---

## 5.7 AI Complaint Analysis — `runAnalysis(fields)`

Three cooperating functions:

```
             runAnalysis(fields)
                 │
      ┌──────────┼───────────────────────────┐
      ▼          ▼                           ▼
classifyRiskLevel  generateComplaintSummary  generateCapaRecommendation
      │                  │                          │
      ▼                  ▼                          ▼
 {level, label,      "Complaint received        {level, actions[],
  score, rationale}   from … classified as …"}    narrative}
```

### Risk classification (`CLASS_LEVELS`)

| Level | Score | Rationale |
| --- | --- | --- |
| Critical | 95 | "Potential safety / regulatory concern requiring immediate attention and possible recall evaluation." |
| High | 75 | "Serious quality deviation with likely product impact; requires batch hold and investigation." |
| Medium | 50 | "Localized quality issue with limited scope; standard complaint investigation recommended." |
| Low | 25 | "Cosmetic / minor defect with no safety implication; monitor and log." |

Classification reuses the same `RISK_CRITICAL/HIGH/MEDIUM` regexes and the same quantity-bump rule, but returns `level`, `label`, `score`, `rationale`.

### CAPA templates (`CAPA_TEMPLATES` per level)

| Level | Example actions |
| --- | --- |
| Critical | Quarantine + recall/field-alert evaluation within 4h; open Critical CAPA; freeze inventory; notify regulators |
| High | Quality hold + stop release; CAPA with root-cause investigation; corrective actions + effectiveness checks |
| Medium | Open complaint investigation; trend batch/product; document disposition (rework/retest/scrap) |
| Low | Log for monitoring; escalate only on trend; no immediate product action |

`CAPA_RCA_TIPS` are the shared investigation hints (review batch records, inspect raw-material lots/equipment, verify labeling/packaging/change-control history).

---

## 5.8 Completeness — `checkCompleteness(fields)`

Same 6 required fields as the frontend (`customerName`, `productName`, `batchNumber`, `complaintType`, `complaintDate`, `description`).

```js
return {
  complete,           // true when no required field missing
  filledCount,        // how many of the 6 are filled
  requiredCount,      // always 6
  score,              // Math.round(filled/6 * 100)
  filled: [{key,label}],   // filled required fields
  missing: [{key,label}]   // missing required fields
}
```

`isFilledValue(v)` = non-null, non-undefined, non-blank.

---

## 5.9 Duplicate detection — `findDuplicates(fields)`

### Matching function `matchComplaint(candidate, existing)`

Weighted fuzzy scoring:

| Signal | Points |
| --- | --- |
| identical normalized batch | 50 |
| identical product | 30 |
| similar product (overlap ≥ 0.5) | 15 |
| identical customer | 15 |
| similar customer (overlap ≥ 0.5) | 8 |
| identical complaint type | 10 |
| similar description (overlap ≥ 0.4) | 10 |

`tokenOverlap(a, b)` compares token sets (lowercased, non-alphanumerics removed):

```
tokenOverlap(a,b) = |tokens(a) ∩ tokens(b)| / |tokens(a)|
```

### Threshold & output

```
candidate form
     │
     ▼  for each logged complaint  →  matchComplaint → score
     ▼
score ≥ 40 (DUPLICATE_THRESHOLD)?
     │ YES                        │ NO
     ▼                            ▼
include in results             skip
     ▼
sort by score desc
     ▼
{
  duplicates: [{ id, score, reason: "same batch, same product…", existing: { customerName, productName, batchNumber, complaintType, complaintDate, createdAt, status } }],
  checked: complaints.size
}
```

---

## 5.10 Root cause — `recommendRootCause(fields)`

`ROOT_CAUSE_MAP` keys match type/description keywords via substring regex:

| Key | Trigger words (substring) | likelyCauses (example) | nextSteps (example) |
| --- | --- | --- | --- |
| `appearance` | appearance | Raw material variance; Process deviation in compression/coating; Handling or transit damage | Review batch records & deviation log; inspect retained samples; investigate handling/storage |
| `packaging` | packaging | Packaging material defect; Seal/lamination failure; Machinery setup or changeover issue | Inspect packaging line setup & sealing; review QC certificates; verify line clearance |
| `labeling` | labeling | Label artwork/print error; Changeover mix-up; Incorrect setup | Verify artwork version; audit changeover; review line clearance |
| `contamin` | contamin | Contamination during manufacturing; Cleanroom control failure; Raw material contamination | Review environmental monitoring; check cleaning validation; sample & test batch |
| `strength` | strength/dosage | Formulation/batching error; Incorrect API addition; Mixing/homogeneity issue | Verify formulation & weighing; review mixing; test assay & uniformity |
| `microbial` | microbial | Microbial contamination; Sterilization failure; Moisture ingress | Run microbial limits testing; review sterilization records; check packaging integrity |
| `storage` | storage/stability | Temperature/humidity excursion; Shelf-life expiry; Inappropriate storage | Review monitoring logs; verify expiry & stability; assess stability data |
| `default` | (no match) | Raw material variance; Process deviation; Handling or storage | Open complaint investigation; review batch records; initiate CAPA |

```js
function recommendRootCause(fields) {
  const text = [complaintType, description, productName].join(' ').toLowerCase()
  for (const [pattern, cfg] of Object.entries(ROOT_CAUSE_MAP)) {   // skip 'default'
    if (new RegExp(pattern, 'i').test(text)) return cfg
  }
  return ROOT_CAUSE_MAP.default
}
// → { product, batch, likelyCauses, nextSteps }
```

---

## 5.11 Chat rule engine — `POST /api/ai/chat`

```
 message + context{form, extracted}
     │
     ├─ extractFields(message)  → chatExtracted
     ├─ isQuestion?  →  ends with "?" OR starts with question word (what/how/why/who/can/could/is/are/do/does/should/would/please…)
     │
     │  extractedPayload = (!isQuestion && looksLikeComplaintData(chatExtracted)) ? chatExtracted : undefined
     │
     ▼
 ┌───────────────────────────┬──────────────────────────────────────────────┐
 │  extractedPayload exists │  otherwise:                                   │
 │  (real complaint content)│  intent detection on the message:             │
 │                          │  1. completeness intent ("complet|missing|    │
 │  1. latest = merge        │     ready to file|what fields…") →           │
 │     extracted+form+payload│     checkCompleteness(latest)                │
 │  2. isEdit = form has     │  2. summary ("summary|summar|what|tell")     │
 │     customer/product/batch│  3. severity/triage ("severity|urgent|       │
 │  3. assessment=assessRisk │     priority|triag")                         │
 │     (latest)              │  4. batch ("batch|lot")                      │
 │  4. build payload:        │  5. product/cause ("product|batch.*issue|    │
 │     + auto severity if    │     cause")                                  │
 │       missing on both     │  6. customer ("customer|who")                │
 │     + auto priority if    │  7. fallback "I don't have enough info…"     │
 │       missing on both     │                                              │
 │     + recommendation if   │  → res.json({ reply })                       │
 │       new complaint       │                                              │
 │  5. description safety:   │                                              │
 │     edits: strip prefix,  │                                              │
 │     drop if not DEFECT    │                                              │
 │  6. reply lists details   │                                              │
 │     → res.json({ reply,   │                                              │
 │        extracted: payload })                                              │
 └───────────────────────────┴──────────────────────────────────────────────┘
```

### Auto-assessment rules (so edits never clobber existing QA data)

```js
if (!payload.severity && !form.severity) payload.severity = assessment.severity
if (!payload.priority && !form.priority) payload.priority = assessment.priority
if (!isEdit && !payload.recommendation && !form.aiSummary) payload.recommendation = assessment.nextAction
```

### Description sanitization on edits

```js
if (isEdit && payload.description) {
  if (!DEFECT_HINTS.test(payload.description)) {
    delete payload.description            // "set the complaint date to…" fragment is NOT a defect
  } else {
    payload.description = payload.description
      .replace(/^\s*(?:please\s+)?(?:update|set|change|edit|make|revise)\s+(?:the\s+)?description\s*(?:to|:|-|=)\s*/i, '')
      .trim()                            // "update the description: cracked tablets" → "cracked tablets"
  }
}
```

---

## 5.12 Route table

| Method | Path | Middleware | Handler | Returns |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | — | `{ok, service, at}` | — |
| `POST` | `/api/complaints` | `express.json` | validate 3 required → save to Map | 201 `{id, status, message}` / 400 |
| `GET` | `/api/complaints` | — | spread Map | `{complaints: []}` |
| `POST` | `/api/ai/extract` | `upload.single('file')` | `extractTextFromFile` → `extractFields` | `{fileName, text, fields}` + console log |
| `POST` | `/api/ai/risk-assessment` | `express.json` | `assessRisk` | `{severity, nextAction, assessment}` |
| `POST` | `/api/ai/completeness` | `express.json` | `checkCompleteness` | completeness result |
| `POST` | `/api/ai/duplicates` | `express.json` | `findDuplicates` | `{duplicates, checked}` |
| `POST` | `/api/ai/root-cause` | `express.json` | `recommendRootCause` | `{product, batch, likelyCauses, nextSteps}` |
| `POST` | `/api/ai/analysis` | `express.json` | `runAnalysis` | `{complaintSummary, riskClassification, capaRecommendation}` |
| `POST` | `/api/ai/chat` | `express.json` | chat rule engine | `{reply, extracted?}` |

Extraction logging (to stdout / redirected log file):

```
[extract] file=test_complaint.pdf size=… textLen=… fields=11
```

Error middleware catches thrown errors → `500 {error: message}`.

---

## 5.13 End-to-end example trace

Request: `POST /api/ai/chat` with a pasted complaint.

```
Request body:
  { "message": "Customer: Acme Pharmaceuticals. Product: Paracetamol 500mg Tablets.
               Batch: B24XR-0087. Two tablets were cracked. (email)",
    "context": { "form": {}, "extracted": {} } }

Server steps:
  1. extractFields(message)
       → { customerName:"Acme Pharmaceuticals", productName:"Paracetamol 500mg Tablets",
           batchNumber:"B24XR-0087", description:"Two tablets were cracked.", complaintSource:"Email" }
  2. isQuestion?  → no ("?" absent, no leading question word)
  3. looksLikeComplaintData? → yes (customerName present)
  4. latest = extracted + form + payload
  5. isEdit? → no (form empty)
  6. assessRisk(latest) → severity "High…", nextAction "Place the batch on quality hold…"
  7. payload.severity = "High…" (not already set)
  8. payload.priority = "High" (not already set)
  9. reply = "I extracted the following details and filled the form: customer \"Acme…\";
     product \"Paracetamol…\"; batch B24XR-0087; source \"Email\"; severity \"High…\";
     priority \"High\". Review the form on the left, then save to begin triage."

Response:
  { "reply": "I extracted … triage.",
    "extracted": { customerName, productName, batchNumber, description, complaintSource, severity, priority } }
```

The frontend then calls `bulkUpdate(extracted)` and the form is populated.