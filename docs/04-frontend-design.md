# 4. Frontend Design

> [Back to index](README.md)

This document explains the frontend in depth: the Redux store, both slices, the Dashboard layout, every component, the design system, and the data flows that keep everything in sync.

---

## 4.1 Entry chain

```
index.html  (#root, Inter font)
    └─ src/main.jsx
         └─ <Provider store={store}>        (React Redux)
              └─ <App />
                   └─ <Dashboard />
```

`store` is created by `configureStore({ reducer: { complaint, ai } })` in `store/index.js`.

---

## 4.2 Redux state overview

```
                        ┌─────────────────────────────────────┐
                        │              STORE                  │
                        │                                     │
  ┌─────────────────────┴───────────────────┐  ┌─────────────┴──────────────────────┐
  │  complaint (complaintSlice)             │  │  ai (aiSlice)                     │
  │                                         │  │                                   │
  │  form            → 11-field object      │  │  fileName         → string|null   │
  │  status          → idle|saving|saved|err│  │  extractStatus    → idle|processing│
  │  error           → string|null          │  │                    |done|error     │
  │  lastSavedId     → uuid|null            │  │  progress         → 0..100         │
  │  list            → [] (saved records)   │  │  statusLine       → string         │
  │  listStatus/listError                   │  │  extractedFields  → object         │
  │                                         │  │  chatMessages     → [{id,role,text}]│
  │                                         │  │  chatInput/chatStatus/chatError    │
  │                                         │  │  riskAssessment   → legacy card    │
  │                                         │  │  analysis         → {status,       │
  │                                         │  │                     complaintSummary,│
  │                                         │  │                     riskClassification,│
  │                                         │  │                     capaRecommendation,│
  │                                         │  │                     error}          │
  └─────────────────────────────────────────┘  └─────────────────────────────────────┘
```

---

## 4.3 `complaintSlice.js` — the form's single source of truth

### Initial form (11 fields)

```js
const initialForm = {
  complaintSource: '', customerName: '', productName: '', productStrength: '',
  batchNumber: '', manufacturingDate: '', expiryDate: '', quantityAffected: '',
  complaintType: '', complaintDate: '', description: ''
}
```

### Reducers

| Action | Behavior |
| --- | --- |
| `updateField({ field, value })` | Writes a single form field (used by every controlled input) |
| `bulkUpdate(patch)` | Applies an object of extracted fields through `aliasMap`; skips empty values and unknown keys |
| `resetForm()` | Restores `initialForm`, clears status/error/lastSavedId |
| `clearError()` | Clears `error` |

### Thunks

```
saveComplaint(form)   → POST /api/complaints   (form is the whole payload)
fetchComplaints()     → GET  /api/complaints   (fills list)
```

Lifecycle states for save: `idle → saving → saved` (with `lastSavedId`) or `error`.

### `bulkUpdate` alias mapping

```js
const aliasMap = {
  complaint_source: 'complaintSource', customer_name: 'customerName',
  product_name: 'productName', product_strength: 'productStrength',
  strength: 'productStrength', batch_number: 'batchNumber', batch_lot: 'batchNumber',
  manufacturing_date: 'manufacturingDate', expiry_date: 'expiryDate',
  quantity_affected: 'quantityAffected', complaint_type: 'complaintType',
  complaint_date: 'complaintDate', description: 'description'
}
```

> This is what makes the same UI work with **both** backends (Express emits camelCase; the FastAPI/LLM pipeline emits snake_case).

---

## 4.4 `aiSlice.js` — extraction, chat, analysis

### Thunks

| Thunk | Endpoint | On success |
| --- | --- | --- |
| `uploadComplaintDocument(file)` | `POST /api/ai/extract` (FormData `file`) | sets `extractedFields` + dispatches `bulkUpdate(fields)` |
| `submitAiMessage({message, context})` | `POST /api/ai/chat` | pushes assistant reply; dispatches `bulkUpdate(extracted)` when the server returned extracted fields |
| `generateRiskAssessment({form, extracted})` | `POST /api/ai/risk-assessment` | fills `riskAssessment` *(legacy — no longer dispatched from the layout)* |
| `generateAiAnalysis({form, extracted})` | `POST /api/ai/analysis` | fills `analysis` |

### Extraction state machine

```
        idle ──uploadComplaintDocument──▶ processing
         │                                │    │
         │   reject                       │  fulfilled
         ▼                                ▼
       error ◀───────────────────────── done
                                             │
                                             ▼
                         bulkUpdate(fields) → form filled
                         statusLine = "Extraction complete — N fields populated the form."
                                      OR "…no fields could be extracted from this document."
```

`statusLine` is deliberately **honest**: it reports the exact number of fields that populated the form, or states clearly that none could be extracted.

### Chat state machine

```
   idle ──submitAiMessage──▶ thinking ──fulfilled──▶ idle  (assistant reply appended)
     │                              └──rejected──▶ error  (chatError set)
```

The `ai` slice also keeps `extractedFields` in sync whenever the chat returns an extraction payload.

---

## 4.5 Dashboard layout

`Dashboard.jsx` renders the two-column grid:

```
┌─────────────────────────────────────────┬──────────────────────────────────┐
│  section.col.col--form                  │  section.col.col--ai             │
│                                         │                                  │
│   ┌───────────────────────────────┐     │   ┌──────────────────────────┐   │
│   │  ComplaintForm               │     │   │  AiAssistant (AIVOA       │   │
│   │  "Log Customer Complaint"    │     │   │  Co-pilot)                │   │
│   └───────────────────────────────┘     │   └──────────────────────────┘   │
│   ┌───────────────────────────────┐     │   ┌──────────────────────────┐   │
│   │  ComplaintAnalysis            │     │   │  RootCause               │   │
│   │  summary·risk·CAPA            │     │   └──────────────────────────┘   │
│   └───────────────────────────────┘     │   ┌──────────────────────────┐   │
│   ┌───────────────────────────────┐     │   │  DuplicateDetector       │   │
│   │  CompletenessChecker          │     │   └──────────────────────────┘   │
│   └───────────────────────────────┘     │                                  │
└─────────────────────────────────────────┴──────────────────────────────────┘
```

### The extraction guard effect

```js
const appliedRef = useRef(null)

useEffect(() => {
  if (extractStatus === 'done' && extractedFields && appliedRef.current !== extractedFields) {
    appliedRef.current = extractedFields
    dispatch(bulkUpdate(extractedFields))   // double-guarantee the form gets filled
  }
}, [extractStatus, extractedFields, dispatch])
```

`appliedRef` stores the last-applied `extractedFields` object reference so each extraction is applied **exactly once**, even though both the thunk and this effect call `bulkUpdate`.

---

## 4.6 Component deep-dive

### `ComplaintForm.jsx`

```
Section 1 · Origin & Customer Details     complaintSource (Select) · customerName (Text)*
Section 2 · Product & Batch Identification productName (Text)* · productStrength (Text)
                                         batchNumber (Text)*
Section 3 · Complaint Details             complaintType (Select)* · quantityAffected (Text)
Section 4 · Dates & Notes                 manufacturingDate (Date) · expiryDate (Date)
                                         complaintDate (Date)* · description (Textarea)*

(* = required field)
Header: "Log Customer Complaint" · subtitle "API & FDF Quality Assurance Module"
Badge:  ⛨ Pending Triage          Footer buttons:  ↺ Reset   💾 Save Complaint
StatusBanner:  ✓ saved (ref: id)  |  ✕ error message
```

- Each section shows a step number (1–4).
- The source dropdown and type dropdown use the **canonical vocabularies** from §3.5.
- `onSubmit` dispatches `saveComplaint(form)`; `onReset` dispatches `resetForm()`.

### `AiAssistant.jsx` — the co-pilot

Layout, top to bottom:

```
┌──────────────────────────────────────────────────────┐
│ ⚡ AIVOA Copilot          ● online   [status pill]   │
│    Drop complaint files or paste text below.         │
├──────────────────────────────────────────────────────┤
│  Welcome bubble: "Ready to process new complaints…"  │
│  [UploadZone]   ← when tool==='upload'               │
│  [PasteInput]   ← when tool==='paste'                │
│  [ExtractProgress] ← when a document is in flight    │
│  chat messages (user → right, assistant → left)      │
│  typing indicator (3 dots) while chatStatus=thinking │
│  error bubble when chatStatus=error                  │
├──────────────────────────────────────────────────────┤
│  [📎 attach menu] [ input…                ] [➤ send] │
│  AI responses may contain errors. Please verify.     │
└──────────────────────────────────────────────────────┘
```

**Attach menu** (paperclip button):

```
┌──────────────────────────────┐
│  ☁ Upload document          │
│  📄 Paste email / text      │
└──────────────────────────────┘
```

**UploadZone** — drag & drop or click to browse:
- Validates extension ∈ `{pdf, docx, txt, eml}` and size ≤ 10 MB (client-side alerts on failure).
- `onDrop`/`onChange` → `dispatch(setFileName(name))` + `dispatch(uploadComplaintDocument(file))`.
- On completion shows file name, **"Extracted N fields — verified & applied to the form"**, and a *"Click to replace document"* CTA.

**PasteInput** — paste free text:
- Word count displayed live.
- **Extract details** wraps the text in `new File([text], 'pasted-complaint.txt', {type:'text/plain'})` and dispatches `uploadComplaintDocument` — the paste path reuses the upload pipeline.

**ExtractProgress** — simulated-but-honest progress:
- `processing`: local % climbs toward 80 (8 → 80 at 320 ms intervals).
- `done`: 100% · `error`: 0%.
- Phase label: `UPLOADING DOCUMENT` (<25%) → `EXTRACTING FIELDS` → `EXTRACTION COMPLETE` / `EXTRACTION FAILED`.

**Saved-complaint bubble** — when the form reports an `id`/`status`, a one-time assistant message announces: *"Complaint saved as case #<id>. Status: Pending Triage."*

### `ComplaintAnalysis.jsx` — AI Complaint Analysis

- **Generate Analysis** button enabled when the form has at least one of `customerName/productName/batchNumber/description`.
- Calls `generateAiAnalysis({ form, extracted })` → `POST /api/ai/analysis`.
- Renders three blocks:

```
┌─ AI Complaint Analysis ──────────────────────────────┐
│  [Generate Analysis]                                 │
│                                                      │
│  S  Complaint Summary                                │
│     "Complaint received from Acme Pharmaceuticals…"  │
│                                                      │
│  R  AI Risk Classification                           │
│     [ HIGH  75 ]   (tone: critical/high/medium/low)  │
│     rationale text                                  │
│                                                      │
│  C  CAPA Recommendation                              │
│     • Place the batch on quality hold…               │
│     • Open a CAPA with root-cause investigation…     │
│     narrative paragraph                             │
└──────────────────────────────────────────────────────┘
```

Tone mapping: `critical → ana-risk--critical`, `high → ana-risk--high`, `medium → ana-risk--medium`, else `ana-risk--low`.

### `CompletenessChecker.jsx`

- Reads `complaint.form`.
- **`hasData` gate**: returns `null` (hidden) when *every* field is empty.
- Uses `checkCompleteness(form)` from `utils/completeness.js`.
- Renders: badge (`Complete ✓` or `N missing ⚠`), progress bar with `score%`, required-field checklist (✓ filled / ⚠ missing), and the optional-fields tracker (`X/5 filled — recommended for full traceability`).

### `RootCause.jsx`

- `hasData` gate (hidden when form empty).
- On form change, debounces **500 ms** then `POST /api/ai/root-cause` with `{ fields: form }`.
- Refresh button regenerates immediately (`run(0)`).
- Renders product/batch context, **likely root causes**, and **recommended investigation steps**.

```
┌─ Root Cause Recommendation ───────────────────────────┐
│  Product: Paracetamol 500mg Tablets                  │
│  Batch: B24XR-0087                                   │
│  🔍 Likely root causes                               │
│     • Packaging material defect                      │
│     • Seal / lamination failure                      │
│  ✓ Recommended investigation steps                   │
│     1. Inspect packaging line setup…                 │
│     2. Review incoming QC certificates…              │
└──────────────────────────────────────────────────────┘
```

### `DuplicateDetector.jsx`

- `hasData` gate (hidden when form empty).
- On form change, debounces **600 ms** then `POST /api/ai/duplicates` with `{ fields: form }`.
- Renders match cards: score %, reason (e.g. "same batch, same product"), and the matched record's customer/product/batch/status.

```
┌─ Duplicate Complaint Detection ──────────────────────┐
│  ⚠ 1 potential duplicate found of 4 logged complaints│
│                                                     │
│  [ 90% ] same batch, same product, same customer    │
│  Customer: …  Product: …  Batch: …  Status: …      │
└─────────────────────────────────────────────────────┘
```

### `RiskAssessment.jsx` / `SavedComplaints.jsx` — legacy / standalone

- `RiskAssessment`: the original "AI copilot risk assessment" card — removed from the layout per product decision; file retained for reference. Its thunk (`generateRiskAssessment`) is still defined in `aiSlice.js`.
- `SavedComplaints`: a standalone list component using `fetchComplaints`; not imported by `Dashboard`.

### `fields/FormField.jsx`

Reusable controls: `FormField` (label wrapper), `TextInput`, `SelectInput`, `DateInput`, `TextArea`. All call the injected `onChange` with `(fieldName, value)` so forms stay controlled and uniform.

### `icons/Icons.jsx`

Named SVG components — `SparkleIcon`, `BotIcon`, `SendIcon`, `LoaderIcon`, `CheckIcon`, `AlertIcon`, `CloseIcon`, `CloudUploadIcon`, `DocumentIcon`, `PaperclipIcon`, `SearchIcon`, `RefreshIcon`, `ClipboardCheckIcon`, `ShieldCheckIcon`, `ResetIcon`, `SaveIcon`, `InfoIcon`, and more.

---

## 4.7 Design system (`index.css` + per-component CSS)

```
 Design tokens        → dark background, blue/purple accents, glassmorphism
 Panels               → .panel (frosted card), .panel-header/.panel-title/.panel-subtitle
 Ambient background   → .ambient with 3 blurred .ambient-orb elements
 Badges / banners     → .badge (ok/warn/outline) · success/danger/info banners
 Buttons              → .btn-mini, .btn-mini--primary, icon refresh buttons
 Grids                → .grid.grid--2 (two-column field rows)
 Feedback            → loading spinners (spin), success checks, error alerts
 Responsive          → two-column dashboard collapses on narrow viewports
```

---

## 4.8 Frontend ⇄ backend contract summary

| UI action | Redux action | HTTP |
| --- | --- | --- |
| Save complaint | `saveComplaint` | `POST /api/complaints` |
| Upload / paste doc | `uploadComplaintDocument` | `POST /api/ai/extract` |
| Chat message | `submitAiMessage` | `POST /api/ai/chat` |
| Generate analysis | `generateAiAnalysis` | `POST /api/ai/analysis` |
| Root cause (debounced) | local fetch in component | `POST /api/ai/root-cause` |
| Duplicates (debounced) | local fetch in component | `POST /api/ai/duplicates` |
| Completeness (live) | local util (no HTTP) | — (chat can also answer) |
| List saved | `fetchComplaints` | `GET /api/complaints` |