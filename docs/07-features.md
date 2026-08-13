# 7. Feature Walkthroughs

> [Back to index](README.md)

This document walks through **every feature** step by step — what happens in the UI, in Redux, and on the server, with flow diagrams.

---

## 7.1 Feature index

| # | Feature | Components / files | Endpoint |
| --- | --- | --- | --- |
| 1 | Manual complaint intake | `ComplaintForm` | `POST /api/complaints` |
| 2 | Document upload + extraction | `AiAssistant` → `UploadZone` | `POST /api/ai/extract` |
| 3 | Paste email / free text | `AiAssistant` → `PasteInput` | `POST /api/ai/extract` |
| 4 | AI Co-pilot chat (triage + NL edits) | `AiAssistant` | `POST /api/ai/chat` |
| 5 | AI Complaint Analysis (summary · risk · CAPA) | `ComplaintAnalysis` | `POST /api/ai/analysis` |
| 6 | Completeness Checker | `CompletenessChecker` | local util (+ chat) |
| 7 | Duplicate Complaint Detection | `DuplicateDetector` | `POST /api/ai/duplicates` |
| 8 | Root Cause Recommendation | `RootCause` | `POST /api/ai/root-cause` |
| 9 | Save / ledger & saved-complaint bubble | `ComplaintForm` + chat | `POST /api/complaints` |
| 10 | Legacy risk assessment card | `RiskAssessment` (not in layout) | `POST /api/ai/risk-assessment` |

---

## 7.1 Manual complaint intake

```
 User fills 4 sections
      │
      ├─ complaintSource   (Select)     Section 1 · Origin & Customer
      ├─ customerName      (Text)*
      ├─ productName       (Text)*      Section 2 · Product & Batch
      ├─ productStrength   (Text)
      ├─ batchNumber       (Text)*
      ├─ complaintType     (Select)*    Section 3 · Complaint Details
      ├─ quantityAffected  (Text)
      ├─ manufacturingDate (Date)       Section 4 · Dates & Notes
      ├─ expiryDate        (Date)
      ├─ complaintDate     (Date)*
      └─ description       (Textarea)*
               │  (* = required)
               ▼
      Click [Save Complaint]
               │
               ▼  dispatch(saveComplaint(form))
   ┌─────────────────────────────┐
   │ POST /api/complaints        │
   │ body: {customerName,        │
   │   productName, batchNumber, │
   │   …all 11 fields}           │
   └──────────────┬──────────────┘
                  │   validates the 3 core fields
                  │   → 400 if missing
                  ▼
            saved to Map with:
              id = crypto.randomUUID()
              status = "pending_triage"
              createdAt = now ISO
                  │
                  ▼
       201 { id, status, message }
                  │
                  ▼
   Redux: status="saved", lastSavedId=id
   UI: green banner "Complaint saved successfully (ref: <id>). Awaiting triage."
```

> The saved record is also added to the in-memory ledger, so **feature #7 (duplicate detection)** can match against it.

---

## 7.2 Document upload + extraction

```
 1. Click paperclip  →  Attach menu  →  [☁ Upload document]
 2. Drag & drop (or click to browse)
    → UploadZone validates:
        extension ∈ {pdf, docx, txt, eml}      (alert otherwise)
        size ≤ 10 MB                            (alert otherwise)
 3. dispatch(setFileName(name))
    dispatch(uploadComplaintDocument(file))
```

Server side:

```
 Express receives multipart "file" (multer, ≤10MB)
      │
      ▼ extractTextFromFile(file)
   ┌───────────────────────────────────────────────┐
   │ .txt  → decode buffer                        │
   │ .pdf  → extractPdfText (own parser + zlib)   │
   │ .docx/.eml → canned sample (demo)            │
   └──────────────────────┬────────────────────────┘
                          ▼ extractFields(text)
   → { customerName, productName, batchNumber, productStrength,
       manufacturingDate, expiryDate, quantityAffected,
       complaintSource, complaintType, complaintDate, description }
      (whichever the text contained)
                          ▼
   response { fileName, text, fields }
   console log:  [extract] file=… size=… textLen=… fields=N
```

Client side (Redux + UI):

```
 fulfilled →
   extractStatus = "done", progress = 100
   statusLine = "Extraction complete — N fields populated the form."
            OR  "Extraction complete — no fields could be extracted from this document."
   extractedFields = fields
   dispatch(bulkUpdate(fields))          ← from the thunk
   Dashboard guard effect also calls
     dispatch(bulkUpdate(extractedFields))  ← exactly once (appliedRef)
```

UI result:

```
 ┌─ dropzone (done state) ──────────────────────┐
 │  ✓                                            │
 │  test_complaint.pdf                           │
 │  Extracted 11 fields — verified & applied to  │
 │  the form                                     │
 │  [Click to replace document]                  │
 └───────────────────────────────────────────────┘
 │  UPLOADING DOCUMENT  →  EXTRACTING FIELDS  →  EXTRACTION COMPLETE  100%
```

After extraction, the form on the left is populated, and the auto-panels (analysis, completeness, duplicates, root cause) react to the new `complaint.form`.

---

## 7.3 Paste email / free text

```
 1. Click paperclip  →  Attach menu  →  [📄 Paste email / text]
 2. Paste into the textarea (live word count)
 3. Click [Extract details]
      │
      ▼
 dispatch(setFileName('Pasted text / email'))
 const sample = new File([text], 'pasted-complaint.txt', { type: 'text/plain' })
 dispatch(uploadComplaintDocument(sample))
      │
      ▼  (identical to §7.2 pipeline, but file type is .txt)
```

The paste path **reuses the upload pipeline** — pasting is just an in-browser `.txt` file.

---

## 7.4 AI Co-pilot chat

The chat distinguishes two kinds of messages:

```
   ┌──────────────────────────────┐       ┌───────────────────────────────┐
   │  QUESTION                   │       │  COMPLAINT CONTENT            │
   │  "What is the severity?"    │       │  "Customer: Acme … Batch: …   │
   │  "Summarize this complaint" │       │   Two tablets were cracked."  │
   │  "Which batch is affected?" │       │                               │
   ├──────────────────────────────┤       ├───────────────────────────────┤
   │  → conversational reply only │       │  → extracted, auto-assessed,  │
   │  → form is NEVER modified    │       │    form filled, confirmation  │
   └──────────────────────────────┘       └───────────────────────────────┘
```

### Detection logic (server)

```
 message + context
   │
   ├─ extractFields(message)
   ├─ isQuestion = ends with "?" OR starts with a question word
   └─ extractedPayload =
        (!isQuestion && looksLikeComplaintData(fields)) ? fields : undefined
```

### When it's a question (no form mutation)

```
   "Is the batch PCM-2026-081?"           →  batch intent → batch reply
   "What fields are still missing?"       →  completeness intent → checkCompleteness(latest)
   "Summarize this" / "What's happening?" →  summary intent
   "Is this urgent?"                      →  severity/triage intent
   "Product issues?"                      →  product/cause intent
   "Who is the customer?"                 →  customer intent
   anything else                          →  fallback guidance
```

### When it's complaint content (form mutation)

```
 1. latest = { ...extracted, ...form, ...new fields }
 2. isEdit = form already has customer/product/batch
 3. assessment = assessRisk(latest)
 4. payload auto-fill (only if not already present):
      severity  = assessment.severity   if form.severity is empty
      priority  = assessment.priority   if form.priority is empty
      recommendation = assessment.nextAction  (new complaints only)
 5. description safety (edits only):
      strip instruction prefix ("update the description: ")
      drop fragments that aren't real defect words
 6. reply lists the details that were filled
 7. response { reply, extracted: payload }
 8. Redux: push assistant reply; dispatch(bulkUpdate(extracted))
```

UI during thinking: typing indicator (3 animated dots). On error: red error bubble. A "saved as case #…" assistant bubble appears when the form reports an id/status.

### Example Q&A

| User | Assistant (approx.) |
| --- | --- |
| "Summarize this complaint" | `Summary of this complaint: customer "Acme Pharmaceuticals", product "Paracetamol 500mg Tablets", batch B24XR-0087. Severity: not set. Next step is to confirm the details on the left and save to begin triage.` |
| "What's still missing?" | `The complaint record is incomplete — 4/6 required fields filled (66%). Still missing: Complaint Type, Description / Details.` |
| "Is this urgent?" | `Based on the current details, severity is "High…". Recommended priority: High — review within 4 hours for Acme Pharmaceuticals.` |
| "Which batch is implicated?" | `The batch/lot on record is "B24XR-0087". Consider a hold-and-test…` |
| "Batch: B24XR-0099" (edit) | `I updated the complaint with the following details: batch B24XR-0099.` |

---

## 7.5 AI Complaint Analysis

```
 1. Ensure at least one of customerName/productName/batchNumber/description is filled
 2. Click [Generate Analysis]  (disabled otherwise / while loading)
 3. dispatch(generateAiAnalysis({ form, extracted }))
      │
      ▼  POST /api/ai/analysis  body { fields: {...} }
   server runAnalysis(fields):
      │
      ├─ classifyRiskLevel → { level, label, score, rationale }   (Critical 95 · High 75 · Medium 50 · Low 25)
      ├─ generateComplaintSummary → narrative string
      └─ generateCapaRecommendation → { level, actions[], narrative }
      │
      ▼
   response { complaintSummary, riskClassification, capaRecommendation }
      │
      ▼
   Redux analysis.status = "done"
```

Rendered blocks:

```
 ┌─ AI Complaint Analysis ───────────────────────────────────────────┐
 │  ⚡  AI Complaint Analysis                     [ ⟳ Generate ]     │
 │      CAPA recommendation · Complaint summary · Risk classification│
 │  ✓  Analysis generated — review below.                           │
 │                                                                    │
 │  S  COMPLAINT SUMMARY                                             │
 │     "Complaint received from Acme Pharmaceuticals regarding        │
 │      Paracetamol 500mg Tablets (batch B24XR-0087), classified as   │
 │      packaging issue. Affected quantity: 6. Details: Two tablets…" │
 │                                                                    │
 │  R  AI RISK CLASSIFICATION                                        │
 │     [ HIGH  75 ]                                                  │
 │     "Serious quality deviation with likely product impact;         │
 │      requires batch hold and investigation."                       │
 │                                                                    │
 │  C  CAPA RECOMMENDATION                                           │
 │     • Place the batch on quality hold and stop further release…   │
 │     • Open a CAPA with root-cause investigation…                  │
 │     • Implement corrective actions and define effectiveness…      │
 │     "For a high-severity complaint involving Paracetamol 500mg…"   │
 └────────────────────────────────────────────────────────────────────┘
```

---

## 7.6 Completeness Checker

```
 live, no button needed
      │
      ▼ useSelector(s => s.complaint.form)
   hasData?  (any field filled)
      │ NO → return null (panel hidden)
      ▼ YES
   checkCompleteness(form)   (utils/completeness.js)
      │
      ▼
   { complete, filledCount, requiredCount:6, score, required[], missing[] }
```

Rendered:

```
 ┌─ Completeness Checker ────────────────────────────────┐
 │  📋 Completeness Checker          [ 2 missing ⚠ ]     │
 │      QA intake readiness checklist                     │
 │  ⚠  2 required fields still missing.                   │
 │      Missing fields are highlighted in the form below. │
 │  Required fields        4/6                            │
 │  [██████████░░░░░░]  66%                               │
 │  ✓ Customer Name        filled                         │
 │  ✓ Product Name         filled                         │
 │  ✓ Batch / Lot Number   filled                         │
 │  ⚠ Complaint Type       missing                        │
 │  ✓ Complaint Date       filled                         │
 │  ⚠ Description / Details missing                       │
 │  ℹ Optional fields (2/5 filled) — recommended for full │
 │     traceability                                       │
 │     ✓ Complaint Source  ✓ Quantity Affected            │
 │     ○ Product Strength  ○ Manufacturing Date  ○ Expiry Date │
 └───────────────────────────────────────────────────────┘
```

> The checker only *reports* missing fields — it never highlights or modifies the form itself.

---

## 7.7 Duplicate Complaint Detection

```
 useSelector(form)
   │
   hasData?  → NO → hidden
   │ YES
   on form change → debounce 600 ms
      │
      ▼ POST /api/ai/duplicates  body { fields: form }
   server findDuplicates(fields):
      │
      ▼ for each logged complaint → matchComplaint(candidate, existing)
   ┌──────────────────────────────────────────────┐
   │ batch identical        +50                  │
   │ product identical      +30  similar  +15    │
   │ customer identical     +15  similar  +8     │
   │ complaint type equal   +10                  │
   │ description overlap ≥.4 +10                 │
   └──────────────────────────────────────────────┘
      │  score ≥ 40 → include, sort desc
      ▼
   { duplicates: [{id, score, reason, existing:{…}}], checked: N }
```

Rendered:

```
 ┌─ Duplicate Complaint Detection ───────────────────────────┐
 │  🔍 Duplicate Complaint Detection     [ ⟳ ]               │
 │      Cross-check against logged complaints               │
 │  ⚠ 1 potential duplicate found of 4 logged complaints.    │
 │                                                          │
 │  [ 90% ] same batch, same product, same customer        │
 │  Customer: Acme Pharmaceuticals  Product: Paracetamol …  │
 │  Batch: B24XR-0087  Status: pending_triage              │
 └──────────────────────────────────────────────────────────┘
```

No matches → green banner: *"No duplicate complaints found among N logged."*

---

## 7.8 Root Cause Recommendation

```
 useSelector(form)
   │
   hasData?  → NO → hidden
   │ YES
   on form change → debounce 500 ms
      │
      ▼ POST /api/ai/root-cause  body { fields: form }
   server recommendRootCause(fields):
      │
      ▼ keyword match complaintType/description/productName
   ROOT_CAUSE_MAP
      │  appearance → packaging → labeling → contamin → strength → microbial → storage → default
      ▼
   { product, batch, likelyCauses[], nextSteps[] }
```

Rendered:

```
 ┌─ Root Cause Recommendation ────────────────────────────────┐
 │  📋 Root Cause Recommendation            [ ⟳ ]              │
 │      Investigation guidance for the reported defect        │
 │  Product: Paracetamol 500mg Tablets                       │
 │  Batch: B24XR-0087                                        │
 │  🔍 Likely root causes                                    │
 │     • Packaging material defect                           │
 │     • Seal / lamination failure                           │
 │     • Machinery setup or changeover issue                 │
 │  ✓ Recommended investigation steps                        │
 │     1. Inspect packaging line setup and sealing parameters│
 │     2. Review incoming QC certificates for packaging mat. │
 │     3. Verify line clearance and changeover records       │
 └────────────────────────────────────────────────────────────┘
```

---

## 7.9 Save → ledger & saved-complaint bubble

```
 Click [Save Complaint]
      │
      ▼ POST /api/complaints
   201 { id, status: "pending_triage", message: "Complaint saved." }
      │
      ▼ Redux: status="saved", lastSavedId=id
   Green banner in form
      │
      ▼ AiAssistant effect watches complaintForm.id + status
   Assistant bubble: "Complaint saved as case #<id>. Status: Pending Triage."
      │
      ▼ Saved record now participates in duplicate detection
```

---

## 7.10 Legacy — risk assessment card

`RiskAssessment.jsx` + `generateRiskAssessment` still exist but the card was **removed from the Dashboard layout**. Its endpoint (`POST /api/ai/risk-assessment`) still works:

```
POST /api/ai/risk-assessment  { fields: {...} }
 → { severity, nextAction, assessment }
```

Risk levels are derived from the `RISK_*` keyword gates and quantity bump (§5.6).

---

## 7.11 End-to-end demo scenario (timeline)

```
 t=0s   User opens http://localhost:5173
 t=1s   Co-pilot welcome bubble visible; form empty; panels hidden
 t=5s   User pastes sample complaint text → clicks Extract
 t=5.5s ExtractProgress: UPLOADING → EXTRACTING → 100%
 t=6s   Form populated with 11 fields
 t=6s   CompletenessChecker appears → 6/6 · Complete badge
 t=6.5s RootCause (500ms) fetches → packaging guidance appears
 t=7s   DuplicateDetector (600ms) fetches → "No duplicates among 1 logged" (if one was saved earlier)
 t=8s   User clicks Generate Analysis → summary + HIGH(75) + CAPA list
 t=10s  User asks "What's still missing?" → "The complaint record is complete — 6/6 required fields (100%)."
 t=12s  User clicks Save Complaint → green banner + saved bubble
```

---

## 7.12 Sample text to paste for demoing every feature

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

Expected results:

| Panel | Result |
| --- | --- |
| Form | all 11 fields auto-filled |
| Completeness | Complete (100%) |
| Analysis (Generate) | Summary · risk `High`/75 · CAPA steps |
| Root Cause | packaging → 3 causes + 3 steps |
| Duplicates | depends on ledger contents |
| Chat "is this urgent?" | severity + priority guidance |