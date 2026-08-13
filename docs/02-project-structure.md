# 2. Project Structure

> [Back to index](README.md)

This document walks through the entire repository, folder by folder, file by file.

---

## 2.1 Full tree

```
LogCustomerComplanit/
│
├── README.md                          # Short overview (kept for quick reference)
│
├── docs/                              # ← You are here
│   ├── README.md                      # Documentation index
│   ├── 01-architecture.md
│   ├── 02-project-structure.md
│   ├── 03-data-model.md
│   ├── 04-frontend-design.md
│   ├── 05-backend-express.md
│   ├── 06-backend-fastapi.md
│   ├── 07-features.md
│   ├── 08-api-reference.md
│   ├── 09-setup-configuration.md
│   └── 10-limitations.md
│
├── backend/
│   ├── package.json                   # Express backend (ESM, "type":"module")
│   ├── server.js                      # ← THE active backend (all routes + engines)
│   ├── requirements.txt               # Python deps for the FastAPI alternative
│   ├── test_complaint.pdf             # Reference PDF used to verify extraction
│   ├── complaints.db                  # SQLite file (created by the FastAPI backend)
│   └── app/                           # FastAPI + LangGraph + Groq alternative backend
│       ├── __init__.py
│       ├── main.py                    # FastAPI app factory + /api/health
│       ├── config.py                  # Environment-driven configuration
│       ├── database.py                # SQLAlchemy engine / session / Base
│       ├── models.py                  # Complaint ORM model
│       ├── schemas.py                 # Pydantic schemas (camelCase aliases)
│       ├── smoke_test.py              # Sanity-check script
│       ├── api/
│       │   ├── __init__.py
│       │   ├── ai.py                  # POST /ai/extract, /ai/chat
│       │   └── complaints.py          # POST/GET /complaints
│       ├── agent/
│       │   ├── __init__.py
│       │   ├── graph.py               # LangGraph state machine
│       │   ├── nodes.py               # extract/assess/chat/compose nodes
│       │   ├── state.py               # AgentState TypedDict
│       │   ├── normalize.py           # Field normalization + regex fallback
│       │   └── llm.py                 # ChatGroq model factory
│       └── services/
│           ├── __init__.py
│           └── text_extract.py        # TXT/PDF/DOCX/EML → plain text
│
└── frontend/
    ├── index.html                     # App shell (Inter font, #root mount)
    ├── package.json                   # React 18, Vite 6, RTK, React Redux
    ├── vite.config.js                 # Dev server + /api → :3001 proxy
    └── src/
        ├── main.jsx                   # Entry — Redux <Provider> + <App>
        ├── App.jsx                    # Renders <Dashboard />
        ├── index.css                  # Global theme / design tokens
        ├── store/
        │   ├── index.js               # configureStore({ complaint, ai })
        │   ├── complaintSlice.js      # Form state, save/list, bulkUpdate
        │   └── aiSlice.js             # Extraction/chat/analysis thunks + state
        ├── utils/
        │   └── completeness.js        # Required/optional field rules
        └── components/
            ├── Dashboard.jsx/.css     # Two-column layout + ambient background
            ├── ComplaintForm.jsx/.css # Intake form (4 sections)
            ├── ComplaintAnalysis.jsx/.css   # AI summary/risk/CAPA card
            ├── CompletenessChecker.jsx/.css # Readiness checklist
            ├── DuplicateDetector.jsx/.css   # Duplicate flags
            ├── RootCause.jsx/.css           # Investigation guidance
            ├── AiAssistant.jsx/.css         # Co-pilot chat + upload/paste
            ├── RiskAssessment.jsx/.css      # Legacy card (unused in layout)
            ├── SavedComplaints.jsx          # Standalone list (not wired)
            ├── fields/
            │   └── FormField.jsx            # Reusable form controls
            └── icons/
                └── Icons.jsx                # SVG icon set
```

---

## 2.2 Backend files in detail

### `backend/server.js` — the active backend (≈1020 lines)

Everything the running system needs lives here:

| Section | Approx. lines | Contents |
| --- | --- | --- |
| Imports / setup | 1–18 | `express`, `cors`, `multer`, `crypto`, `zlib`; app + port; JSON limit; multer config; `complaints` Map |
| Alias/constant maps | 20–108 | `ALIASES`, `MONTHS`, `SOURCE_MAP`, `TYPE_MAP`, `DEFECT_HINTS`, `PRODUCT_STOP` |
| Date helpers | 40–70 | `pad2`, `toISOYear`, `toISODate` |
| Field extractor | 110–305 | `extractFields` + `looksLikeComplaintData` |
| PDF parser | 307–419 | `decodePdfLiteral`, `decodePdfHex`, `extractTextOperators`, `extractPdfText`, `extractTextFromFile` |
| Risk assessment | 421–479 | `RISK_*` regexes, `RISK_ACTIONS`, `assessRisk` |
| AI analysis | 481–591 | `CLASS_LEVELS`, `classifyRiskLevel`, `CAPA_TEMPLATES`, `generateCapaRecommendation`, `generateComplaintSummary`, `runAnalysis` |
| Completeness | 593–622 | `REQUIRED_FIELDS`, `checkCompleteness` |
| Duplicates | 624–723 | `norm`, `tokenOverlap`, `matchComplaint`, `findDuplicates` |
| Root cause | 725–846 | `ROOT_CAUSE_MAP`, `recommendRootCause` |
| Routes | 848–1013 | All HTTP endpoints |
| Error handling / listen | 1015–1022 | Error middleware, `app.listen` |

### `backend/app/` — FastAPI + LangGraph + Groq alternative

| File | Responsibility |
| --- | --- |
| `main.py` | Creates the FastAPI app, CORS, `/api/health`, mounts routers |
| `config.py` | Loads `.env`; `GROQ_API_KEY`, model names, `DATABASE_URL` (default SQLite), `MAX_UPLOAD_MB` |
| `database.py` | SQLAlchemy `engine`, `SessionLocal`, `Base`, `get_db` dependency |
| `models.py` | `Complaint` ORM row (11 complaint fields + severity/priority/status/ai_summary/timestamps) |
| `schemas.py` | Pydantic `ComplaintBase/Create/Out`, `ChatContext`, `ChatRequest`; camelCase aliases |
| `api/ai.py` | `/api/ai/extract` (upload → text → agent), `/api/ai/chat` (agent) |
| `api/complaints.py` | `POST/GET /api/complaints` with SQLite persistence |
| `agent/graph.py` | LangGraph: `extract → {chat | assess → compose} → END` |
| `agent/nodes.py` | The four LangGraph nodes + severity/priority heuristics + allowed-value lists |
| `agent/state.py` | `AgentState` TypedDict shared by the graph |
| `agent/normalize.py` | `clean_fields`, canonical label maps, `parse_json`, `heuristic_extract_fields` |
| `agent/llm.py` | `ChatGroq` factory (extraction / assessment / chat models) |
| `services/text_extract.py` | Real parsing for TXT, PDF (`pypdf`), DOCX (`python-docx`), EML (stdlib) |

---

## 2.3 Frontend files in detail

### Entry & shell

| File | Purpose |
| --- | --- |
| `index.html` | Loads the Inter font and the `#root` div; the single HTML shell |
| `main.jsx` | `ReactDOM.createRoot`, wraps `<App/>` in Redux `<Provider store>` |
| `App.jsx` | Returns `<Dashboard />` |
| `index.css` | Global design tokens: dark theme, colors, typography, shared utility classes |
| `vite.config.js` | Dev server on `:5173`; proxy `/api` → `http://localhost:3001` |

### Store

| File | Purpose |
| --- | --- |
| `store/index.js` | `configureStore` wiring `complaint` and `ai` reducers |
| `store/complaintSlice.js` | The form state, `updateField`, `bulkUpdate` (alias map), `resetForm`, `saveComplaint`, `fetchComplaints` |
| `store/aiSlice.js` | Extraction / chat / risk / analysis thunks and their status/state shapes |

### Utils

| File | Purpose |
| --- | --- |
| `utils/completeness.js` | `REQUIRED_FIELDS` (6), `OPTIONAL_FIELDS` (5), `isFilled`, `checkCompleteness(form)` |

### Components

| Component | File(s) | Role in the UI |
| --- | --- | --- |
| `Dashboard` | `Dashboard.jsx` / `.css` | Two-column grid; guard effect that applies `extractedFields` to the form |
| `ComplaintForm` | `ComplaintForm.jsx` / `.css` | Four-section intake form; save / reset; save-status banner |
| `AiAssistant` | `AiAssistant.jsx` / `.css` | Chat UI: welcome bubble, attach menu, upload dropzone, paste input, progress bar, messages, input bar |
| `ComplaintAnalysis` | `ComplaintAnalysis.jsx` / `.css` | "Generate Analysis" button; summary, risk badge, CAPA list |
| `CompletenessChecker` | `CompletenessChecker.jsx` / `.css` | Required-field checklist + optional-field tracker; hidden when form empty |
| `DuplicateDetector` | `DuplicateDetector.jsx` / `.css` | Debounced duplicate cross-check; hidden when form empty |
| `RootCause` | `RootCause.jsx` / `.css` | Debounced root-cause guidance; hidden when form empty |
| `RiskAssessment` | `RiskAssessment.jsx` / `.css` | **Legacy** — exists but not rendered in the layout |
| `SavedComplaints` | `SavedComplaints.jsx` | **Standalone** — lists complaints; not wired into `Dashboard` |
| `fields/FormField` | `fields/FormField.jsx` | `TextInput`, `SelectInput`, `DateInput`, `TextArea` |
| `icons/Icons` | `icons/Icons.jsx` | SVG icon components used across all panels |

---

## 2.4 Why two backends?

```
 ┌───────────────────────────────┐      ┌─────────────────────────────────┐
 │  Express  (:3001)  ACTIVE     │      │  FastAPI+Groq (:8000)  ALTERNATIVE│
 │  • zero dependencies beyond   │      │  • real LLM extraction           │
 │    express/cors/multer        │      │  • structured output (Pydantic)  │
 │  • works fully offline        │      │  • natural-language edits (DIFF) │
 │  • no API keys needed         │      │  • SQLite persistence            │
 │  • deterministic, fast        │      │  • requires GROQ_API_KEY         │
 │  • regex/keyword heuristics   │      │  • LangGraph agent routing       │
 └───────────────────────────────┘      └─────────────────────────────────┘
        ▲  wired to the UI                    ▲  swap vite proxy :3001 → :8000
```

Both backends share the same **field contract** (camelCase ↔ snake_case), so the frontend can talk to either without changes.
