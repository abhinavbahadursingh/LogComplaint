# 10. Known Limitations & Future Work

> [Back to index](README.md)

An honest list of what the system does *not* do yet, plus suggested next steps.

---

## 10.1 Limitations summary

| Area | Limitation | Impact |
| --- | --- | --- |
| Storage (Express) | In-memory `Map` | Saved complaints reset on server restart |
| "AI" (Express) | Heuristic regex/keyword engine | Not a real LLM; misses unusual phrasings |
| File parsing (Express) | DOCX/EML return a canned sample | Only TXT and PDF are truly parsed |
| OCR | No support for scanned/image-only PDFs | 400 error on such documents |
| Chat | Stateless | No conversation memory across messages |
| CORS | Fully open (`*`) | Must be tightened for production |
| Legacy components | `RiskAssessment`, `SavedComplaints` unused | Present but not rendered |
| Two backends | FastAPI/LLM not wired to UI | Requires proxy change to activate |
| Frontend status | Form has no persisted `status` field | Save-status banner/bubble depend on server responses |

---

## 10.2 In-memory storage (Express)

```
 saved complaints  →  Map  →  RESET on restart
                        ▲
                        └─ duplicate detection reads only this Map
```

- **Consequence:** duplicate checks only see complaints saved in the current session; "checked: N" resets to 0 on restart.
- **Fix options:** swap `Map` for a database (the FastAPI backend already demonstrates SQLAlchemy/SQLite persistence) or an in-memory store that survives restarts (e.g. lowdb / JSON file).

---

## 10.3 Heuristic "AI" (Express)

The active backend is deterministic regex + keyword logic. It works offline and fast, but:

- It only recognizes fields phrased in the patterns it knows.
- It can't understand natural-language variations an LLM would handle.
- Risk scoring uses keyword gates, not genuine clinical/regulatory judgment.

**Use the FastAPI backend** (`backend/app/`) for real LLM extraction/assessment/chat; wire it by changing the Vite proxy target (see `06-backend-fastapi.md` and `09-setup-configuration.md`).

---

## 10.4 Stubbed file parsing (Express)

| Extension | Express (:3001) | FastAPI (:8000) |
| --- | --- | --- |
| `.txt` | ✅ parsed | ✅ parsed |
| `.pdf` | ✅ parsed (custom parser) | ✅ parsed (`pypdf`) |
| `.docx` | ⚠️ canned sample | ✅ parsed (`python-docx`) |
| `.eml` | ⚠️ canned sample | ✅ parsed (stdlib `email`) |

> The canned sample is the "Acme Pharmaceuticals / Paracetamol 500mg" fixture. It exercises the pipeline end-to-end but ignores the real file contents.

---

## 10.5 No OCR

Scanned or image-only PDFs have no embedded text layer → the extractor finds nothing (`textLen=0`) and FastAPI returns a clear 400. Adding OCR (e.g. Tesseract) would cover image PDFs.

---

## 10.6 Chat is stateless

```
 message N+1  →  context rebuilt from Redux form + extracted fields
                 (no memory of earlier chat turns)
```

Each request to `/api/ai/chat` receives the *current* form + extracted snapshot. For true conversation memory, store the transcript server-side (FastAPI could keep it per-session).

---

## 10.7 CORS wide open

`app.use(cors())` and FastAPI `allow_origins=["*"]` are dev defaults. For production, restrict to the deployed frontend origin(s).

---

## 10.8 Legacy / unused components

```
frontend/src/components/
  ├── RiskAssessment.jsx/.css   → removed from Dashboard layout
  └── SavedComplaints.jsx       → standalone; never imported
```

They can be deleted or re-enabled. The `generateRiskAssessment` thunk and `/api/ai/risk-assessment` endpoint remain functional.

---

## 10.9 Suggested roadmap

| Priority | Item | Effort |
| --- | --- | --- |
| High | Persist Express complaints (SQLite/JSON file) | Small |
| High | Real DOCX/EML parsing in Express (mammoth, mailparser) | Small |
| Medium | Wire the LLM backend as an optional mode | Small |
| Medium | OCR for scanned PDFs | Medium |
| Medium | Chat session memory | Medium |
| Low | Real saved-complaint list panel in the Dashboard | Small |
| Low | Tighten CORS + auth for production | Small |
| Low | End-to-end tests (Playwright) | Medium |

---

## 10.10 Verified behaviors (as of last test pass)

- ✅ Uncompressed and FlateDecode-compressed PDFs → 11 fields each.
- ✅ Vite proxy → Express returns the full extraction payload (verified via Node `fetch` through :5173).
- ✅ Express `/api/health` responds.
- ✅ Frontend `npm run build` succeeds.
- ✅ Completeness endpoint reports 0% (empty) and 100% (full).
- ✅ Duplicate threshold (40) and root-cause mapping (packaging example) verified.
- ⚠️ The user's original failing PDF was never shared, so extraction of *that specific file* remains unverified.