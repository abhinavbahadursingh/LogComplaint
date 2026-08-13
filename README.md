# Customer Complaint Intake & QA Module

A dark, enterprise-grade SaaS dashboard for logging pharmaceutical **customer complaints** and running a quality-assurance (QA) triage flow. It pairs a structured complaint intake form with an **AI Intake Co-pilot** that extracts complaint data from uploaded documents (or pasted emails), and then guides the QA workflow with risk analysis, CAPA recommendations, completeness checks, duplicate detection, and root-cause investigation guidance.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20Redux%20%2B%20Express-blue) ![Status](https://img.shields.io/badge/status-operational-brightgreen) ![TypeScript](https://img.shields.io/badge/language-JavaScript%20(ESM)-yellow)

> **📚 Full documentation:** the `docs/` folder contains 10 in-depth documents — start at [`docs/README.md`](docs/README.md).

---

## 📑 Table of contents

- [Features at a glance](#-features-at-a-glance)
- [UI overview](#-ui-overview)
- [Architecture](#-architecture)
- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure-summary)
- [Getting started](#-getting-started)
- [Try a full demo flow](#-try-a-full-demo-flow)
- [API summary with examples](#-api-summary-with-examples)
- [How the "AI" works](#-how-the-ai-works)
- [Data model](#-data-model)
- [Chat intents](#-chat-intents)
- [Configuration](#-configuration)
- [Documentation map](#-documentation-map)
- [Known limitations](#-known-limitations-summary)
- [Scripts](#-scripts)
- [Status](#-status)

---

## ✨ Features at a glance

| # | Feature | What it does |
| --- | --- | --- |
| 1 | **Complaint Log Form** | Structured intake across origin, product/batch identification, complaint details, and dates. |
| 2 | **AI Intake Co-pilot (chat)** | Drag-and-drop upload of `PDF`/`DOCX`/`TXT`/`EML`, paste raw email text, live extraction progress, conversational triage (summaries, severity guidance, investigation steps). |
| 3 | **AI Complaint Analysis** | One-click complaint summary, risk classification (with score), and CAPA recommendation. |
| 4 | **Completeness Checker** | Live QA intake-readiness checklist: 6 required + 5 optional fields. |
| 5 | **Duplicate Complaint Detection** | Fuzzy cross-check of the current form against logged complaints. |
| 6 | **Root Cause Recommendation** | Likely root causes + investigation steps derived from the complaint type/description. |
| 7 | **QMS Ledger** | Save complaints to the ledger with `pending_triage` status; saved records feed duplicate detection. |

### Feature detail

| Feature | In-depth description |
| --- | --- |
| **1. Complaint Log Form** | 4 sections: (1) Origin & Customer Details, (2) Product & Batch Identification, (3) Complaint Details, (4) Dates & Notes. Includes save/reset buttons, a save-status banner, and client + server validation of the 3 core required fields (`customerName`, `productName`, `batchNumber`). |
| **2. AI Intake Co-pilot** | A full chat interface with a paperclip **attach menu** offering **Upload document** (drag-and-drop dropzone, click-to-browse) and **Paste email / text** (with live word count). Extraction progress is visualized as a `UPLOADING DOCUMENT → EXTRACTING FIELDS → EXTRACTION COMPLETE` bar. Pasted text is wrapped as a `.txt` file and reuses the exact upload pipeline. |
| **3. AI Complaint Analysis** | "Generate Analysis" button → produces a natural-language complaint summary, a tone-coded risk badge (Critical/High/Medium/Low with a numeric score), and a CAPA recommendation (action list + narrative). |
| **4. Completeness Checker** | Live, no-button checklist. Shows `X/6` required + `Y/5` optional with a percentage score and per-field ✓/⚠ status. Hidden entirely when the form is empty. |
| **5. Duplicate Detection** | Debounced (600 ms) fuzzy match against every logged complaint. Each match shows a score %, the reason (e.g. "same batch, same product"), and the existing record's customer/product/batch/status. Hidden when the form is empty. |
| **6. Root Cause** | Debounced (500 ms) keyword match on complaint type/description → likely root causes + recommended investigation steps, with product/batch context. Hidden when the form is empty. |
| **7. QMS Ledger** | `POST /api/complaints` validates required fields and stores `{ id, ...fields, status: "pending_triage", createdAt }`. A confirmation bubble appears in the chat once saved. |

---

## 🖥️ UI overview

```
┌───────────────────────────────────────────┬──────────────────────────────────────┐
│  LEFT COLUMN                             │  RIGHT COLUMN                        │
│                                           │                                      │
│  ┌─ Log Customer Complaint ────────────┐  │  ┌─ AIVOA Copilot ────────────────┐  │
│  │  Section 1 · Origin & Customer      │  │  │  ⚡ chat · upload · paste      │  │
│  │  Section 2 · Product & Batch        │  │  │  📎 attach menu               │  │
│  │  Section 3 · Complaint Details      │  │  └────────────────────────────────┘  │
│  │  Section 4 · Dates & Notes          │  │  ┌─ Root Cause Recommendation ───┐  │
│  │  [↺ Reset] [💾 Save Complaint]     │  │  │  likely causes + next steps   │  │
│  └────────────────────────────────────┘  │  └────────────────────────────────┘  │
│  ┌─ AI Complaint Analysis ────────────┐  │  ┌─ Duplicate Complaint Detection ┐  │
│  │  summary · risk badge · CAPA list  │  │  │  match % vs logged complaints  │  │
│  └────────────────────────────────────┘  │  └────────────────────────────────┘  │
│  ┌─ Completeness Checker ────────────┐  │                                      │
│  │  required/optional checklist      │  │                                      │
│  └────────────────────────────────────┘  │                                      │
└───────────────────────────────────────────┴──────────────────────────────────────┘
```

The dashboard uses a **dark glassmorphism** design with blue/purple accents, ambient background orbs, and a responsive two-column layout that collapses on narrow viewports. Reusable form controls (`TextInput`, `SelectInput`, `DateInput`, `TextArea`) live in `fields/FormField.jsx`; a stroke-based SVG icon set lives in `icons/Icons.jsx`.

---

## 🏗️ Architecture

```
            ┌───────────────────────────────────────────────────────────┐
            │                     BROWSER  (:5173)                      │
            │   React 18 · Redux Toolkit · Vite 6 (HMR)                │
            └───────────────────────────────┬───────────────────────────┘
                                            │  fetch("/api/...")
                                            ▼
                              ┌─────────────────────────────┐
                              │   VITE DEV SERVER  (:5173)  │
                              │   /api/*  →  :3001  (proxy) │
                              └─────────────────────────────┘
                                            │
        ┌───────────────────────────────────┴───────────────────────────────────┐
        ▼                                                                       ▼
┌───────────────────────────────────┐                   ┌──────────────────────────────────────┐
│  EXPRESS API  (:3001)  ACTIVE     │                   │  FASTAPI + LANGGRAPH + GROQ (:8000)   │
│  REST routes · multer upload      │                   │  LLM extraction / assessment / chat   │
│  heuristic AI engines             │                   │  SQLAlchemy → SQLite                  │
│  in-memory complaints Map         │                   │  (functional, NOT wired to the UI)    │
└───────────────────────────────────┘                   └──────────────────────────────────────┘
```

### Request flow — document upload (end-to-end)

```
 User         AiAssistant.jsx         aiSlice (Redux)        Vite :5173        Express :3001
  │  drop file      │                       │                    │                  │
  ├────────────────►│  uploadComplaintDocument(file)             │                  │
  │                 ├──────────────────────►│  FormData{file}   │                  │
  │                 │                       ├──────────────────►│  POST /api/ai/extract
  │                 │                       │                    │───────────────►│  extractTextFromFile()
  │                 │                       │                    │                │  extractFields(text)
  │                 │                       │◄───────────────────│◄───────────────│  {fileName,text,fields}
  │                 │                       │                    │                │  log [extract] fields=N
  │                 │                       │  bulkUpdate(fields)│                │
  │                 │◄──────────────────────┤  statusLine="Extraction complete — N fields…"
  │   form auto-fills + progress bar 100% ◄─┤
```

**Two interchangeable backends share one field contract:**

- **Express (:3001) — active.** A zero-dependency heuristic engine (regex extraction, keyword risk scoring, rule-based chat). Works fully **offline with no API keys**.
- **FastAPI + LangGraph + Groq (:8000) — alternative.** A real LLM pipeline with structured JSON extraction, LLM-driven edits, and SQLite persistence. Requires a `GROQ_API_KEY`. Swap the Vite proxy target to activate it.

> The frontend accepts **both** naming conventions (camelCase from Express, snake_case from the LLM pipeline) via a single alias map, so swapping backends needs no UI changes.

---

## 🧰 Tech stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 18, Vite 6, Redux Toolkit, React Redux | HMR dev server, production build → `dist/` |
| Active backend | Node.js, Express 4, Multer, `node:zlib` | PDF parsing is hand-rolled — no external deps |
| Alt backend | FastAPI, LangGraph, LangChain-Groq, SQLAlchemy, `pypdf`, `python-docx` | LLM-powered alternative |
| Storage | In-memory `Map` (Express) · SQLite `complaints.db` (FastAPI) | Resets on restart (Express) |
| Languages | JavaScript (ESM) · Python 3 | — |

---

## 📁 Project structure (summary)

```
LogCustomerComplanit/
├── docs/                     # 10 in-depth documentation files (start here)
├── backend/
│   ├── server.js             # Express API + heuristic AI engines (ACTIVE, ~1020 lines)
│   ├── test_complaint.pdf    # Reference PDF for extraction verification
│   ├── requirements.txt      # Python deps for the alternative backend
│   ├── package.json          # ESM, scripts: dev (--watch) / start
│   └── app/                  # FastAPI + LangGraph + Groq backend
│       ├── main.py           # FastAPI app + CORS + /api/health
│       ├── agent/            # LangGraph state machine (extract/assess/chat/compose)
│       ├── api/              # /api/ai/* and /api/complaints routers
│       └── services/         # TXT/PDF/DOCX/EML text extraction
└── frontend/
    ├── vite.config.js        # Dev server :5173 + /api → :3001 proxy
    ├── index.html            # App shell (Inter font, #root)
    └── src/
        ├── main.jsx          # Entry (Redux Provider)
        ├── App.jsx           # Renders <Dashboard />
        ├── store/            # Redux: complaintSlice + aiSlice
        ├── utils/            # completeness.js (field rules)
        └── components/       # Dashboard, ComplaintForm, AiAssistant,
                              # ComplaintAnalysis, CompletenessChecker,
                              # DuplicateDetector, RootCause, + shared controls
```

See [`docs/02-project-structure.md`](docs/02-project-structure.md) for the full annotated tree.

---

## 🚀 Getting started

### Prerequisites

- **Node.js 18+** (ESM, Vite 6, native `fetch`/`FormData`)

### 1. Run the backend

```bash
cd backend
npm install
npm run dev        # node --watch server.js → http://localhost:3001
```

You should see `Backend listening on http://localhost:3001`.

### 2. Run the frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server → http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies all `/api/*` requests to the backend on port 3001.

### Production build

```bash
cd frontend
npm run build      # → frontend/dist
npm run preview    # serve the production build locally
```

### Quick health check

```bash
curl http://localhost:3001/api/health
# {"ok":true,"service":"customer-complaint","at":"2026-08-13T22:06:30.549Z"}
```

---

## 🧪 Try a full demo flow

1. Open **http://localhost:5173** (both servers running).
2. In the co-pilot, paste this sample (or upload `backend/test_complaint.pdf`):

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

3. The form auto-fills with the extracted fields; the progress bar shows a live count (`Extracted 11 fields`).
4. **AI Complaint Analysis** → click **Generate Analysis** to see the summary, risk classification (e.g. `High · 75`), and CAPA recommendation.
5. **Completeness Checker** updates live to `6/6 · Complete`; **Root Cause Recommendation** shows packaging-related causes; **Duplicate Detection** cross-checks the ledger.
6. Ask the co-pilot triage questions:
   - *"What's still missing?"* → completeness answer
   - *"Is this urgent?"* → severity/priority guidance
   - *"Summarize this complaint"* → context summary
   - *"Which batch is implicated?"* → batch-specific hold-and-test advice
7. Click **Save Complaint** to commit the record to the ledger (a confirmation bubble appears in chat).

---

## 🌐 API summary with examples

**Base URL (dev):** `http://localhost:3001`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/complaints` | Save a complaint (`customerName`, `productName`, `batchNumber` required) |
| `GET` | `/api/complaints` | List all saved complaints |
| `POST` | `/api/ai/extract` | Multipart upload (`file`, ≤ 10 MB) → extracted fields + raw text |
| `POST` | `/api/ai/chat` | Chat with the co-pilot; body `{ message, context }` |
| `POST` | `/api/ai/analysis` | AI analysis: `{ complaintSummary, riskClassification, capaRecommendation }` |
| `POST` | `/api/ai/completeness` | Required-field completeness check |
| `POST` | `/api/ai/duplicates` | Duplicate cross-check against logged complaints |
| `POST` | `/api/ai/root-cause` | Root cause + investigation steps |
| `POST` | `/api/ai/risk-assessment` | Legacy risk assessment card endpoint |

### Example 1 — extract fields from a document

```bash
curl -X POST http://localhost:3001/api/ai/extract -F "file=@test_complaint.pdf"
```

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

### Example 2 — AI analysis

```bash
curl -X POST http://localhost:3001/api/ai/analysis \
  -H "Content-Type: application/json" \
  -d '{"fields":{"productName":"Paracetamol 500mg Tablets","batchNumber":"B24XR-0087","complaintType":"Packaging Issue","description":"Cracked tablets found on opening the pack."}}'
```

```json
{
  "complaintSummary": "Complaint received from an unidentified customer regarding Paracetamol 500mg Tablets (batch B24XR-0087), classified as packaging issue. Details: Cracked tablets found on opening the pack.",
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
    "narrative": "For a high-severity complaint involving Paracetamol 500mg Tablets (batch B24XR-0087), the recommended CAPA approach is: …"
  }
}
```

### Example 3 — chat

```bash
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the severity?","context":{"form":{"productName":"Paracetamol 500mg Tablets","batchNumber":"B24XR-0087"}}}'
```

```json
{
  "reply": "Based on the current details, severity is \"not yet assessed\". Recommended priority: Normal — review within 24 hours for an unidentified customer."
}
```

See [`docs/08-api-reference.md`](docs/08-api-reference.md) for the complete reference for both backends.

---

## 🔎 How the "AI" works

The active Express backend is a **heuristic engine** — deterministic, offline, and fast:

- **Extraction** — regex cascades match customer, product, batch, strength, dates, quantity, source, severity, priority, type, and description; dates are normalized to `YYYY-MM-DD`. PDF text is parsed in-house (stream scan + `zlib` inflate + operator-aware line splitting) with **zero external dependencies**.
- **Risk / analysis** — keyword gates rank complaints into Critical / High / Medium / Low (scores 95/75/50/25), pick a next action, and generate CAPA recommendations per level.
- **Duplicates** — weighted fuzzy scoring (batch 50 · product 30/15 · customer 15/8 · type 10 · description 10), flagged at a score ≥ 40.
- **Chat** — intent rules distinguish **questions** (conversational reply, form untouched) from **complaint content** (extracted, auto-assessed, and written to the form).

### Engine map

```
                        ┌────────────────────────────────┐
                        │          server.js            │
                        │         (single file)         │
                        └───────────────┬────────────────┘
                                        │
     ┌──────────────┬──────────────┬────┴─────┬─────────────────┬─────────────┐
     ▼              ▼              ▼          ▼                 ▼             ▼
 extractFields  assessRisk    runAnalysis  checkCompleteness findDuplicates recommendRootCause
 (regex)        (risk scores) (summary/    (6 required        (weighted      (keyword map →
                95·75·50·25)   risk/CAPA)   fields)           match ≥ 40)     causes+steps)
```

### File-type support

| Extension | Express (:3001) | FastAPI (:8000) |
| --- | --- | --- |
| `.txt` | ✅ parsed | ✅ parsed |
| `.pdf` | ✅ parsed (custom parser) | ✅ parsed (`pypdf`) |
| `.docx` | ⚠️ canned sample | ✅ parsed (`python-docx`) |
| `.eml` | ⚠️ canned sample | ✅ parsed (stdlib `email`) |

The FastAPI backend swaps the heuristics for a real LLM (Groq) driven by a **LangGraph** agent (`extract → chat | assess → compose`), with structured JSON output and diff-based form edits.

See [`docs/05-backend-express.md`](docs/05-backend-express.md) and [`docs/06-backend-fastapi.md`](docs/06-backend-fastapi.md).

---

## 🧠 Data model

### Complaint form — 11 fields

| Field | Required | Control | Example |
| --- | --- | --- | --- |
| Complaint Source | optional | Select | `Email` |
| Customer Name | ✅ | Text | `Acme Pharmaceuticals` |
| Product Name | ✅ | Text | `Paracetamol 500mg Tablets` |
| Product Strength / Grade | optional | Text | `500 mg / USP Grade` |
| Batch / Lot Number | ✅ | Text | `B24XR-0087` |
| Manufacturing Date | optional | Date | `2026-04-12` |
| Expiry Date | optional | Date | `2028-04-11` |
| Quantity Affected | optional | Text | `6` |
| Complaint Type | ✅ | Select | `Packaging Issue` |
| Complaint Date | ✅ | Date | `2026-08-08` |
| Description / Details | ✅ | Textarea | `Two tablets… were cracked…` |

The **same 6 required fields** are enforced on the frontend (`utils/completeness.js`) and the backend (`checkCompleteness`) for defense in depth.

### Canonical label sets

- **Complaint sources:** `Email`, `Phone Call`, `Portal / Web form`, `Field Representative`, `Distributor`, `Regulatory Body`, `Social Media`
- **Complaint types:** `Appearance / Visual Defect`, `Packaging Issue`, `Labeling Error`, `Strength / Dosage Issue`, `Contamination`, `Physical / Chemical Property`, `Microbial Issue`, `Storage / Stability Concern`, `Other`
- **Severity:** `Low — Minor cosmetic issue`, `Medium — Moderate, localized impact`, `High — Potential safety / regulatory concern`, `Critical — Immediate recall consideration`
- **Priority:** `Low`, `Normal`, `High`, `Urgent`

See [`docs/03-data-model.md`](docs/03-data-model.md).

---

## 💬 Chat intents

The co-pilot routes messages through intent rules:

| Intent | Trigger examples | Behavior |
| --- | --- | --- |
| **Extraction / edit** | Pasted complaint text (customer/product/batch…) | Extracts fields, auto-assesses missing severity/priority, fills the form, returns a confirmation + `extracted` payload |
| **Completeness** | "What's still missing?", "ready to file?", "checklist" | Reports `X/6` filled + a % score |
| **Summary** | "Summarize this", "tell me about it" | Summarizes customer/product/batch/severity |
| **Severity / triage** | "Is this urgent?", "priority", "triage" | Gives severity + review-window guidance |
| **Batch** | "Which batch is implicated?" | Batch lookup + hold-and-test advice |
| **Product / cause** | "Product issues?", "root cause?" | Typical causes + CAPA suggestion |
| **Customer** | "Who is the customer?" | Customer lookup |
| **Fallback** | anything else | Asks for more info |

Questions never modify the form — only genuine complaint content does.

---

## ⚙️ Configuration

| Setting | Location | Default |
| --- | --- | --- |
| Express port | `backend/server.js` (`PORT` env) | `3001` |
| JSON body limit | `backend/server.js` | `2mb` |
| Upload size limit | `backend/server.js` (multer) | `10 MB` |
| Frontend dev port | `frontend/vite.config.js` | `5173` |
| API proxy target | `frontend/vite.config.js` | `http://localhost:3001` |
| Supported uploads | `AiAssistant.jsx` (`ACCEPTED`) | `.pdf,.docx,.txt,.eml` |
| Duplicate threshold | `backend/server.js` (`DUPLICATE_THRESHOLD`) | `40` |
| Root-cause debounce | `RootCause.jsx` | `500 ms` |
| Duplicate debounce | `DuplicateDetector.jsx` | `600 ms` |
| LLM model(s) | `backend/app/config.py` | `llama-3.1-8b-instant` / `llama-3.3-70b-versatile` |
| DB (alt backend) | `backend/app/config.py` (`DATABASE_URL`) | `sqlite:///./complaints.db` |

---

## 📖 Documentation map

| File | Covers |
| --- | --- |
| [`docs/README.md`](docs/README.md) | Index + quick start |
| [`docs/01-architecture.md`](docs/01-architecture.md) | Component, sequence, and data-flow diagrams |
| [`docs/02-project-structure.md`](docs/02-project-structure.md) | Every folder/file explained |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Fields, required rules, aliases, canonical values |
| [`docs/04-frontend-design.md`](docs/04-frontend-design.md) | Redux, components, layout, design system |
| [`docs/05-backend-express.md`](docs/05-backend-express.md) | Active backend engines & routes |
| [`docs/06-backend-fastapi.md`](docs/06-backend-fastapi.md) | LLM backend + LangGraph agent |
| [`docs/07-features.md`](docs/07-features.md) | Step-by-step feature walkthroughs |
| [`docs/08-api-reference.md`](docs/08-api-reference.md) | Full API reference |
| [`docs/09-setup-configuration.md`](docs/09-setup-configuration.md) | Setup, env vars, troubleshooting |
| [`docs/10-limitations.md`](docs/10-limitations.md) | Known limitations + roadmap |

---

## ⚠️ Known limitations (summary)

- **In-memory storage (Express)** — saved complaints reset on server restart; the FastAPI backend offers SQLite persistence.
- **Heuristic AI (Express)** — regex/keyword based, not a real LLM; swap the proxy to `:8000` for the LLM pipeline.
- **Stubbed file parsing (Express)** — DOCX/EML return a canned sample; only TXT and PDF are truly parsed (FastAPI parses all four).
- **No OCR** — scanned/image-only PDFs are rejected with a clear error.
- **Chat is stateless** — context is rebuilt from the current form + extracted fields per message.

Full details: [`docs/10-limitations.md`](docs/10-limitations.md).

---

## 🛠️ Scripts

| Directory | Script | Command |
| --- | --- | --- |
| `backend/` | dev | `npm run dev` (`node --watch server.js`) |
| `backend/` | start | `npm start` (`node server.js`) |
| `frontend/` | dev | `npm run dev` (Vite + HMR) |
| `frontend/` | build | `npm run build` → `dist/` |
| `frontend/` | preview | `npm run preview` |
| `backend/app/` | LLM backend | `uvicorn app.main:app --port 8000` |

---

## ✅ Status

- Express backend: **operational** on :3001 (`/api/health` responds).
- PDF extraction (uncompressed + FlateDecode): **verified** → 11 fields.
- Frontend production build: **passes** (`npm run build`).
- FastAPI/LLM backend: **functional** but requires a Groq API key and a proxy swap to activate.