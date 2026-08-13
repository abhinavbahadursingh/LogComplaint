# 3. Data Model

> [Back to index](README.md)

This document defines every piece of data the system stores, transports, and transforms: the complaint record, required vs. optional fields, canonical label values, alias mapping, and the shapes produced by the analysis/duplicate/root-cause engines.

---

## 3.1 The complaint record — single source of truth

The complaint has **11 user-facing fields**. The canonical definition is `initialForm` in `frontend/src/store/complaintSlice.js`, and it is mirrored by the FastAPI schema `ComplaintBase` (`backend/app/schemas.py`) and the ORM model `Complaint` (`backend/app/models.py`).

| # | Key (camelCase) | DB column (snake_case) | Label (UI) | Required | Control |
| --- | --- | --- | --- | --- | --- |
| 1 | `complaintSource` | `complaint_source` | Complaint Source | optional | Select |
| 2 | `customerName` | `customer_name` | Customer Name | **required** | Text |
| 3 | `productName` | `product_name` | Product Name | **required** | Text |
| 4 | `productStrength` | `product_strength` | Product Strength / Grade | optional | Text |
| 5 | `batchNumber` | `batch_number` | Batch / Lot Number | **required** | Text |
| 6 | `manufacturingDate` | `manufacturing_date` | Manufacturing Date | optional | Date |
| 7 | `expiryDate` | `expiry_date` | Expiry Date | optional | Date |
| 8 | `quantityAffected` | `quantity_affected` | Quantity Affected | optional | Text |
| 9 | `complaintType` | `complaint_type` | Complaint Type | **required** | Select |
| 10 | `complaintDate` | `complaint_date` | Complaint Date | **required** | Date |
| 11 | `description` | `description` | Description / Details | **required** | Textarea |

```
Required  (6):  customerName  productName  batchNumber  complaintType  complaintDate  description
Optional  (5):  complaintSource  productStrength  quantityAffected  manufacturingDate  expiryDate
```

---

## 3.2 Required vs. optional — enforced in two places

The **same rules** are duplicated (deliberately, for defense-in-depth) in:

1. **Frontend** — `frontend/src/utils/completeness.js`

   ```js
   export const REQUIRED_FIELDS = [
     { key: 'customerName',  label: 'Customer Name' },
     { key: 'productName',   label: 'Product Name' },
     { key: 'batchNumber',   label: 'Batch / Lot Number' },
     { key: 'complaintType', label: 'Complaint Type' },
     { key: 'complaintDate', label: 'Complaint Date' },
     { key: 'description',   label: 'Description / Details' }
   ]
   ```

2. **Backend** — `backend/server.js` (`checkCompleteness`) uses the identical list with labels.

`isFilled(v)` = value is not `undefined`/`null` and not an empty/whitespace string.

### Completeness result shape

```json
{
  "complete": false,
  "filledCount": 3,
  "requiredCount": 6,
  "score": 50,
  "filled": [ { "key": "customerName", "label": "Customer Name", "filled": true }, "…" ],
  "missing": [ { "key": "complaintType", "label": "Complaint Type", "filled": false }, "…" ]
}
```

---

## 3.3 Saved record shapes

### Express (in-memory) — `POST /api/complaints`

Stored as a plain object in a `Map`:

```js
{
  id: "3f2c…-uuid",          // crypto.randomUUID()
  customerName: "Acme Pharmaceuticals",
  productName: "Paracetamol 500mg Tablets",
  batchNumber: "B24XR-0087",
  // …all 11 fields the client sent…
  createdAt: "2026-08-13T22:06:30.549Z",
  status: "pending_triage"    // default on save
}
```

### FastAPI / SQLite — `Complaint` ORM row

Adds QA metadata on top of the 11 fields:

```python
id               Integer PK
status           String, default "pending_triage"   (indexed)
severity         String(120) nullable               # "High — Potential safety / regulatory concern"
priority         String(50)  nullable               # "Low" | "Normal" | "High" | "Urgent"
ai_summary       Text nullable
created_at       DateTime (utcnow)
updated_at       DateTime (onupdate=utcnow)
```

The Pydantic layer accepts **either** naming convention because of `ConfigDict(populate_by_name=True, from_attributes=True)` plus per-field `alias` values — a `ComplaintOut` serializes back to camelCase with `by_alias=True`.

---

## 3.4 Field name aliases (frontend `bulkUpdate`)

`bulkUpdate` in `complaintSlice.js` maps snake_case (FastAPI/LLM style) keys to camelCase form keys so **any** backend payload lands in the form:

```
 complaint_source   → complaintSource        customer_name     → customerName
 product_name       → productName            product_strength  → productStrength
 strength           → productStrength        batch_number      → batchNumber
 batch_lot          → batchNumber            manufacturing_date→ manufacturingDate
 expiry_date        → expiryDate             quantity_affected → quantityAffected
 complaint_type     → complaintType          complaint_date    → complaintDate
 description        → description
```

The same bidirectional mapping exists in the FastAPI `EXISTING_KEY_MAP` (`agent/nodes.py`) for LLM-diff merging, and the Express extractor emits camelCase directly.

---

## 3.5 Canonical label values

Both backends normalize free-text input into these **fixed vocabularies**. These exact strings appear in dropdowns and in AI output.

### Complaint source (`SOURCE_MAP`)

```
"Email" · "Phone Call" · "Portal / Web form" · "Field Representative"
"Distributor" · "Regulatory Body" · "Social Media" · "Email" (fax/letter fall through)
```

### Complaint type (`TYPE_MAP`)

```
"Appearance / Visual Defect" · "Packaging Issue" · "Labeling Error"
"Strength / Dosage Issue" · "Contamination" · "Physical / Chemical Property"
"Microbial Issue" · "Storage / Stability Concern" · "Other"
```

Keyword → type map (first match wins, substring):
`appearance → Appearance/Visual Defect` · `packaging → Packaging Issue` · `labeling → Labeling Error` · `contamin → Contamination` · `microbial → Microbial Issue` · `stability|storage → Storage/Stability Concern` · `dosage|strength|effectiveness → Strength/Dosage Issue` · `quality|other → Other`

### Severity (fixed 4 levels)

```
"Low — Minor cosmetic issue"
"Medium — Moderate, localized impact"
"High — Potential safety / regulatory concern"
"Critical — Immediate recall consideration"
```

### Priority (fixed 4 levels)

```
"Low" · "Normal" · "High" · "Urgent"
```

---

## 3.6 Dates — normalization to `YYYY-MM-DD`

`toISODate(raw)` in `server.js` accepts multiple human formats and normalizes them:

| Input | Normalized |
| --- | --- |
| `10 June 2026` | `2026-06-10` |
| `June 10, 2026` | `2026-06-10` |
| `12/04/2026` | `2026-04-12` |
| `10-Jun-2026` | `2026-06-10` |
| `12.04.26` | `2026-04-12` |

`toISOYear` disambiguates 2-digit years (`70+ → 19xx`, else `20xx`).

---

## 3.7 Derived outputs — engine result shapes

### Risk assessment (`assessRisk`)

```json
{
  "severity": "High — Potential safety / regulatory concern",
  "nextAction": "Place the batch on quality hold, open a CAPA, …",
  "assessment": "Complaint received from Acme Pharmaceuticals regarding Paracetamol 500mg Tablets (batch B24XR-0087), classified as packaging issue. Based on the reported condition, the risk level is assessed as high. Recommended action: …"
}
```

### AI analysis (`runAnalysis`)

```json
{
  "complaintSummary": "Complaint received from … classified as ….",
  "riskClassification": {
    "level": "High",
    "label": "High — Potential safety / regulatory concern",
    "score": 75,
    "rationale": "Serious quality deviation with likely product impact; …"
  },
  "capaRecommendation": {
    "level": "High",
    "actions": [ "Place the batch on quality hold and stop further release…", "…" ],
    "narrative": "For a high-severity complaint involving … recommended CAPA approach is: …"
  }
}
```

Risk scores by level: **Critical 95 · High 75 · Medium 50 · Low 25**.

### Duplicate match (`findDuplicates`)

```json
{
  "duplicates": [
    {
      "id": "…uuid…",
      "score": 90,
      "reason": "same batch, same product, same customer",
      "existing": {
        "customerName": "…", "productName": "…", "batchNumber": "…",
        "complaintType": "…", "complaintDate": "…", "createdAt": "…", "status": "pending_triage"
      }
    }
  ],
  "checked": 4
}
```

### Root cause (`recommendRootCause`)

```json
{
  "product": "Paracetamol 500mg Tablets",
  "batch": "B24XR-0087",
  "likelyCauses": [ "Packaging material defect", "Seal / lamination failure", "Machinery setup or changeover issue" ],
  "nextSteps": [ "Inspect packaging line setup and sealing parameters", "…", "…" ]
}
```

---

## 3.8 Scoring reference — duplicate detection weights

| Signal | Condition | Points |
| --- | --- | --- |
| Batch | exact match (normalized) | 50 |
| Product | exact match | 30 |
| Product | token overlap ≥ 0.5 | 15 |
| Customer | exact match | 15 |
| Customer | token overlap ≥ 0.5 | 8 |
| Complaint type | exact match | 10 |
| Description | token overlap ≥ 0.4 | 10 |

`tokenOverlap(a,b)` = (tokens shared between a and b) / (tokens in a).
A complaint is flagged when total score **≥ 40** (`DUPLICATE_THRESHOLD`).
