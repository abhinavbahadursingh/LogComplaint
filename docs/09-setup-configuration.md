# 9. Setup & Configuration

> [Back to index](README.md)

Everything you need to install, run, and configure the system.

---

## 9.1 Prerequisites

| Tool | Version | Required for |
| --- | --- | --- |
| Node.js | 18+ (ESM, Vite 6) | Frontend + Express backend |
| npm | bundled with Node | package install |
| Python 3.10+ *(optional)* | — | FastAPI alternative backend |
| Groq API key *(optional)* | — | LLM backend only |

---

## 9.2 Quick start (active stack)

```
Terminal 1              Terminal 2
─────────────           ─────────────
cd backend              cd frontend
npm install             npm install
npm run dev  (:3001)    npm run dev  (:5173)
```

Open **http://localhost:5173**.

```
┌──────────────────────────────────────────┐
│  Browser → :5173                         │
│      └─ /api/*  →  :3001 (Vite proxy)   │
└──────────────────────────────────────────┘
```

---

## 9.3 Backend scripts

| Script | Command | Effect |
| --- | --- | --- |
| `npm run dev` | `node --watch server.js` | Auto-restart on file changes |
| `npm start` | `node server.js` | Plain start |

### Running the Express backend with logs

```powershell
# Output to files so the console stays clean
cd backend
node server.js *> C:\Users\<you>\AppData\Local\Temp\opencode\express.log 2> C:\Users\<you>\AppData\Local\Temp\opencode\express.err
```

The extract route logs progress lines:

```
[extract] file=test_complaint.pdf size=… textLen=… fields=11
Backend listening on http://localhost:3001
```

---

## 9.4 Frontend scripts

| Script | Command | Effect |
| --- | --- | --- |
| `npm run dev` | `vite` | Dev server with HMR on :5173 |
| `npm run build` | `vite build` | Production build → `frontend/dist` |
| `npm run preview` | `vite preview` | Serve the built app locally |

---

## 9.5 Optional — run the FastAPI / LLM backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Create backend/.env (see 9.6)
# GROQ_API_KEY=your_key_here

uvicorn app.main:app --port 8000
```

Check: `curl http://localhost:8000/api/health`. Interactive docs: `http://localhost:8000/docs`.

### Switch the UI to the LLM backend

Edit `frontend/vite.config.js`:

```js
server: {
  port: 5173,
  proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } }
}
```

Restart Vite. No other code changes needed — the frontend already maps both naming conventions.

---

## 9.6 Environment variables (FastAPI only)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | *(empty)* | LLM key (required; get at https://console.groq.com) |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Extraction model |
| `GROQ_CHAT_MODEL` | `llama-3.3-70b-versatile` | Chat model |
| `GROQ_ASSESSMENT_MODEL` | `llama-3.3-70b-versatile` | Assessment model |
| `DATABASE_URL` | `sqlite:///./complaints.db` | SQLAlchemy connection string (Postgres/MySQL examples in `config.py`) |

Example `backend/.env`:

```
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.1-8b-instant
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
DATABASE_URL=sqlite:///./complaints.db
```

---

## 9.7 Configuration reference (all settings)

| Setting | Location | Default |
| --- | --- | --- |
| Express port | `backend/server.js` (`PORT` env) | `3001` |
| JSON body limit | `backend/server.js` | `2mb` |
| Upload size limit | `backend/server.js` (multer) | `10 MB` |
| Frontend dev port | `frontend/vite.config.js` | `5173` |
| API proxy target | `frontend/vite.config.js` | `http://localhost:3001` |
| Supported uploads | `frontend/src/components/AiAssistant.jsx` (`ACCEPTED`) | `.pdf,.docx,.txt,.eml` |
| Root-cause debounce | `frontend/src/components/RootCause.jsx` | `500 ms` |
| Duplicate debounce | `frontend/src/components/DuplicateDetector.jsx` | `600 ms` |
| Duplicate threshold | `backend/server.js` (`DUPLICATE_THRESHOLD`) | `40` |
| Required fields (frontend) | `frontend/src/utils/completeness.js` | 6 fields |
| Required fields (backend) | `backend/server.js` | 6 fields (same) |
| FastAPI port | `uvicorn --port` | `8000` |
| Max upload (FastAPI) | `backend/app/config.py` | `10 MB` |
| DB (FastAPI) | `backend/app/config.py` (`DATABASE_URL`) | `sqlite:///./complaints.db` |

---

## 9.8 Troubleshooting

### Backend "Extracted 0 fields"

Check the extract log line first:

```
[extract] file=… size=… textLen=… fields=0
```

- **`textLen=0`** → the document had no readable text (scanned/image-only PDF, empty file).
- **`textLen>0, fields=0`** → the text doesn't match the extractor's patterns; paste the text into the chat instead, or try a TXT file.
- If you are seeing **0 fields in the browser** but the server logs `fields=N>0`, the page is stale — **hard-refresh** (Ctrl+Shift+R); the status line in the dropzone always reflects the last server response.

### "Extraction complete — no fields could be extracted" but I know the file has data

- Paste the raw text via the paperclip menu instead — it reuses the same pipeline and is easier to debug.
- TXT and PDF are truly parsed; DOCX/EML currently return a canned sample (see limitations).

### Server not listening

- Confirm the process is alive and `Backend listening on http://localhost:3001` was printed.
- Check the redirected log file for body-parser errors (`entity.parse.failed` usually means malformed JSON was sent).
- Restart with `npm run dev`.

### Chat returns "not enough info"

- Chat is **stateless** — context is rebuilt from the current Redux form + extracted fields on every message. Fill the form first, then ask.

### Duplicates never trigger

- `DUPLICATE_THRESHOLD` is 40. The ledger only contains complaints saved via `POST /api/complaints` in the **current server session** (in-memory Map resets on restart). Save a few complaints first, then type a similar one.

---

## 9.9 Health check commands

```bash
# Express
curl http://localhost:3001/api/health

# FastAPI
curl http://localhost:8000/api/health

# Full end-to-end probe through the Vite proxy (Express)
curl -X POST http://localhost:5173/api/ai/risk-assessment ^
  -H "Content-Type: application/json" ^
  -d "{\"fields\":{\"productName\":\"X\",\"description\":\"cracked tablets\"}}"
```

Expected outputs:

```json
{ "ok": true, "service": "customer-complaint", "at": "…" }     # both backends
{ "severity": "…", "nextAction": "…", "assessment": "…" }      # risk probe
```