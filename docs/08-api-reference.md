# 8. API Reference

> [Back to index](README.md)

Complete HTTP API reference for **both** backends, with request/response examples and status codes.

---

## 8.1 Base URLs

| Backend | Base URL | Notes |
| --- | --- | --- |
| Express (active) | `http://localhost:3001` | Default proxy target from Vite |
| FastAPI (alternative) | `http://localhost:8000` | Not wired to the UI by default |

All endpoints are JSON unless stated (extract uses multipart). Content-Type for JSON requests: `application/json`.

---

## 8.2 Express endpoints (active)

```
 GET  /api/health
 POST /api/complaints
 GET  /api/complaints
 POST /api/ai/extract          (multipart: file)
 POST /api/ai/risk-assessment  (legacy)
 POST /api/ai/completeness
 POST /api/ai/duplicates
 POST /api/ai/root-cause
 POST /api/ai/analysis
 POST /api/ai/chat
```

### 8.2.1 `GET /api/health`

**Response** `200`

```json
{
  "ok": true,
  "service": "customer-complaint",
  "at": "2026-08-13T22:06:30.549Z"
}
```

### 8.2.2 `POST /api/complaints` — save a complaint

**Request**

```json
{
  "customerName": "Acme Pharmaceuticals",
  "productName": "Paracetamol 500mg Tablets",
  "productStrength": "500 mg / USP Grade",
  "batchNumber": "B24XR-0087",
  "manufacturingDate": "2026-04-12",
  "expiryDate": "2028-04-11",
  "quantityAffected": "6",
  "complaintType": "Packaging Issue",
  "complaintDate": "2026-08-08",
  "description": "Two tablets inside the blister were found cracked on opening the pack.",
  "complaintSource": "Email"
}
```

**Validation:** `customerName`, `productName`, `batchNumber` are required → else `400`.

**Response** `201`

```json
{ "id": "4f2f0a7e-…", "status": "pending_triage", "message": "Complaint saved." }
```

**Error** `400`

```json
{ "error": "customerName, productName and batchNumber are required." }
```

### 8.2.3 `GET /api/complaints` — list saved complaints

**Response** `200`

```json
{
  "complaints": [
    {
      "id": "4f2f0a7e-…",
      "customerName": "Acme Pharmaceuticals",
      "productName": "Paracetamol 500mg Tablets",
      "batchNumber": "B24XR-0087",
      "status": "pending_triage",
      "createdAt": "2026-08-13T22:06:30.549Z",
      "…": "…all fields the client sent…"
    }
  ]
}
```

### 8.2.4 `POST /api/ai/extract` — extract fields from a document

Multipart form-data with the file under the **`file`** key. Max 10 MB.

**cURL**

```bash
curl -X POST http://localhost:3001/api/ai/extract \
  -F "file=@test_complaint.pdf"
```

**Response** `200` — `{ fileName, text, fields }`

```json
{
  "fileName": "test_complaint.pdf",
  "text": "Customer: Acme Pharmaceuticals\nProduct: Paracetamol 500mg Tablets\n…",
  "fields": {
    "customerName": "Acme Pharmaceuticals",
    "productName": "Paracetamol 500mg Tablets",
    "productStrength": "500 mg / USP Grade",
    "batchNumber": "B24XR-0087",
    "manufacturingDate": "2026-04-12",
    "expiryDate": "2028-04-11",
    "quantityAffected": "6",
    "complaintSource": "Email",
    "complaintType": "Packaging Issue",
    "complaintDate": "2026-08-08",
    "description": "Two tablets inside the blister were found cracked on opening the pack."
  }
}
```

**Error** `400`

```json
{ "error": "No file provided (multipart key \"file\")." }
```

Server log line on success:

```
[extract] file=test_complaint.pdf size=… textLen=… fields=11
```

### 8.2.5 `POST /api/ai/risk-assessment` — (legacy) risk assessment

**Request**

```json
{
  "fields": {
    "customerName": "Acme Pharmaceuticals",
    "productName": "Paracetamol 500mg Tablets",
    "batchNumber": "B24XR-0087",
    "complaintType": "Packaging Issue",
    "quantityAffected": "6",
    "description": "Two tablets inside the blister were found cracked on opening the pack. Packaging shows signs of moisture ingress."
  }
}
```

**Response** `200`

```json
{
  "severity": "High — Potential safety / regulatory concern",
  "nextAction": "Place the batch on quality hold, open a CAPA, and run a root-cause investigation before releasing any further stock.",
  "assessment": "Complaint received from Acme Pharmaceuticals regarding Paracetamol 500mg Tablets (batch B24XR-0087), classified as packaging issue. Based on the reported condition, the risk level is assessed as high. Recommended action: …"
}
```

### 8.2.6 `POST /api/ai/completeness` — check required fields

Accepts `{ form: {...} }` or `{ fields: {...} }`.

**Request**

```json
{ "form": { "customerName": "Acme", "productName": "X", "batchNumber": "B1" } }
```

**Response** `200`

```json
{
  "complete": false,
  "filledCount": 3,
  "requiredCount": 6,
  "score": 50,
  "filled": [
    { "key": "customerName", "label": "Customer Name" },
    { "key": "productName", "label": "Product Name" },
    { "key": "batchNumber", "label": "Batch / Lot Number" }
  ],
  "missing": [
    { "key": "complaintType", "label": "Complaint Type" },
    { "key": "complaintDate", "label": "Complaint Date" },
    { "key": "description", "label": "Description / Details" }
  ]
}
```

### 8.2.7 `POST /api/ai/duplicates` — duplicate cross-check

**Request**

```json
{ "fields": { "customerName": "Acme", "productName": "Paracetamol 500mg Tablets", "batchNumber": "B24XR-0087" } }
```

**Response** `200`

```json
{
  "duplicates": [
    {
      "id": "4f2f0a7e-…",
      "score": 100,
      "reason": "same batch, same product, same customer",
      "existing": {
        "customerName": "Acme Pharmaceuticals",
        "productName": "Paracetamol 500mg Tablets",
        "batchNumber": "B24XR-0087",
        "complaintType": "Packaging Issue",
        "complaintDate": "2026-08-08",
        "createdAt": "2026-08-13T22:06:30.549Z",
        "status": "pending_triage"
      }
    }
  ],
  "checked": 4
}
```

### 8.2.8 `POST /api/ai/root-cause` — investigation guidance

**Request**

```json
{ "fields": { "complaintType": "Packaging Issue", "description": "Cracked tablets on opening the pack" } }
```

**Response** `200`

```json
{
  "product": null,
  "batch": null,
  "likelyCauses": [
    "Packaging material defect",
    "Seal / lamination failure",
    "Machinery setup or changeover issue"
  ],
  "nextSteps": [
    "Inspect packaging line setup and sealing parameters",
    "Review incoming QC certificates for packaging material",
    "Verify line clearance and changeover records"
  ]
}
```

### 8.2.9 `POST /api/ai/analysis` — AI Complaint Analysis

**Request**

```json
{ "fields": { "customerName": "Acme", "productName": "Paracetamol 500mg Tablets", "batchNumber": "B24XR-0087", "complaintType": "Packaging Issue", "quantityAffected": "6", "description": "Cracked tablets found on opening the pack." } }
```

**Response** `200`

```json
{
  "complaintSummary": "Complaint received from Acme Pharmaceuticals regarding Paracetamol 500mg Tablets (batch B24XR-0087), classified as packaging issue. Affected quantity: 6. Details: Cracked tablets found on opening the pack.",
  "riskClassification": {
    "level": "High",
    "label": "High — Potential safety / regulatory concern",
    "score": 75,
    "rationale": "Serious quality deviation with likely product impact; requires batch hold and investigation."
  },
  "capaRecommendation": {
    "level": "High",
    "actions": [
      "Place the batch on quality hold and stop further release of affected stock.",
      "Open a CAPA with root-cause investigation; review batch records, process controls, and release criteria.",
      "Implement corrective actions and define effectiveness checks before re-release."
    ],
    "narrative": "For a high-severity complaint involving Paracetamol 500mg Tablets (batch B24XR-0087), the recommended CAPA approach is: place the batch on quality hold… During the investigation, review manufacturing batch records…"
  }
}
```

### 8.2.10 `POST /api/ai/chat` — co-pilot chat

**Request**

```json
{
  "message": "What is the severity?",
  "context": {
    "form": { "customerName": "Acme", "productName": "Paracetamol 500mg Tablets", "batchNumber": "B24XR-0087" },
    "extracted": {}
  }
}
```

**Response** `200` — question (no extraction):

```json
{
  "reply": "Based on the current details, severity is \"not yet assessed\". Recommended priority: Normal — review within 24 hours for Acme."
}
```

**Response** `200` — pasted complaint content (with `extracted`):

```json
{
  "reply": "I extracted the following details and filled the form: customer \"Acme Pharmaceuticals\"; product \"Paracetamol 500mg Tablets\"; batch B24XR-0087; type \"Packaging Issue\"; source \"Email\"; severity \"High — Potential safety / regulatory concern\"; priority \"High\". Review the form on the left, then save to begin triage.",
  "extracted": {
    "customerName": "Acme Pharmaceuticals",
    "productName": "Paracetamol 500mg Tablets",
    "batchNumber": "B24XR-0087",
    "complaintType": "Packaging Issue",
    "complaintSource": "Email",
    "severity": "High — Potential safety / regulatory concern",
    "priority": "High",
    "description": "Two tablets were cracked."
  }
}
```

### Error handling (all Express endpoints)

```
4xx  → { "error": "human readable message" }
5xx  → { "error": err.message }   (from the error middleware)
```

---

## 8.3 FastAPI endpoints (alternative)

```
 GET  /api/health
 POST /api/complaints
 GET  /api/complaints
 POST /api/ai/extract          (multipart: file)
 POST /api/ai/chat   (also aliased POST /api/chat)
```

Interactive docs available at `http://localhost:8000/docs`.

### 8.3.1 `POST /api/ai/extract`

**cURL**

```bash
curl -X POST http://localhost:8000/api/ai/extract -F "file=@report.pdf"
```

**Response** `200` — `{ fileName, text, fields }` (fields include `severity`, `priority`, `recommendation`).

**Errors**

```
413  File exceeds upload limit.
400  Unsupported file type: .xyz
400  Could not read text from the document. It may be corrupt or encrypted.
400  No readable text found in the document. Scanned or image-only PDFs are not supported yet.
```

### 8.3.2 `POST /api/ai/chat`

**Request**

```json
{
  "message": "Customer: Acme Pharmaceuticals. Product: Paracetamol 500mg Tablets. Batch: B24XR-0087. Two tablets were cracked.",
  "context": { "form": {}, "extracted": {} }
}
```

**Response** `200`

```json
{
  "reply": "I processed that as a new complaint and extracted the following details: customer \"Acme Pharmaceuticals\"; product \"Paracetamol 500mg Tablets\" … Initial severity: High — Potential safety / regulatory concern. Priority: High.",
  "extracted": { "customer_name": "…", "product_name": "…", "…": "…" }
}
```

> Note: FastAPI returns **snake_case** field keys; the frontend's `bulkUpdate` alias map converts them to form keys automatically.

### 8.3.3 `POST /api/complaints`

**Request** (accepts camelCase **or** snake_case thanks to `populate_by_name`)

```json
{
  "customerName": "Acme Pharmaceuticals",
  "productName": "Paracetamol 500mg Tablets",
  "batchNumber": "B24XR-0087"
}
```

**Response** `201`

```json
{ "id": 1, "status": "pending_triage", "message": "Complaint saved." }
```

**Error** `400` (missing required fields)

```json
{ "detail": "customerName, productName and batchNumber are required." }
```

### 8.3.4 `GET /api/complaints`

**Response** `200` — camelCase keys via `ComplaintOut`:

```json
{
  "complaints": [
    {
      "id": 1,
      "customerName": "Acme Pharmaceuticals",
      "productName": "Paracetamol 500mg Tablets",
      "batchNumber": "B24XR-0087",
      "status": "pending_triage",
      "createdAt": "2026-08-13T22:06:30",
      "updatedAt": "2026-08-13T22:06:30",
      "…": "…"
    }
  ]
}
```

---

## 8.4 Endpoint comparison

| Endpoint | Express :3001 | FastAPI :8000 | Purpose |
| --- | --- | --- | --- |
| `/api/health` | ✅ | ✅ | Health check |
| `POST /api/complaints` | ✅ (Map) | ✅ (SQLite) | Save complaint |
| `GET /api/complaints` | ✅ | ✅ | List complaints |
| `POST /api/ai/extract` | ✅ (heuristic) | ✅ (LLM agent) | Document → fields |
| `POST /api/ai/chat` | ✅ (rules) | ✅ (LLM agent) | Chat / NL edits |
| `POST /api/ai/risk-assessment` | ✅ (legacy) | — | Risk assessment |
| `POST /api/ai/completeness` | ✅ | — | Completeness check |
| `POST /api/ai/duplicates` | ✅ | — | Duplicate detection |
| `POST /api/ai/root-cause` | ✅ | — | Root cause guidance |
| `POST /api/ai/analysis` | ✅ | — | AI analysis (summary/risk/CAPA) |