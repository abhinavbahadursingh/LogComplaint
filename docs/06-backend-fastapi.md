# 6. Backend Design — FastAPI + LangGraph + Groq (Alternative)

> [Back to index](README.md)

This document covers the second backend living in `backend/app/`. It is a full LLM-powered implementation using **FastAPI**, **LangGraph** (an agent state machine), and **Groq** (LLM inference), with SQLite persistence. It is **functional but not wired to the frontend** — the Vite proxy currently points to Express (:3001). To use it, change `frontend/vite.config.js` target to `http://localhost:8000`.

---

## 6.1 Why this backend exists

| | Express (:3001) — active | FastAPI (:8000) — alternative |
| --- | --- | --- |
| "AI" approach | regex/keyword heuristics | real LLM (Groq) with structured output |
| Form editing | re-extraction rules | **LLM diff** — only new/changed fields |
| Extraction | custom PDF parser + regex | `pypdf` + LLM JSON extraction |
| Persistence | in-memory `Map` | SQLite via SQLAlchemy |
| API keys | none | requires `GROQ_API_KEY` |
| Offline | ✅ fully | ❌ needs network + key |

Both expose the **same field contract**, so swapping the proxy target is the only wiring change.

---

## 6.2 Application bootstrap — `main.py`

```
backend/app/main.py
    │
    ├─ Base.metadata.create_all(bind=engine)   # create SQLite tables on start
    ├─ app = FastAPI(title="Customer Complaint Intake API", version="1.0.0")
    ├─ CORSMiddleware (allow all origins)
    ├─ GET /api/health → { ok, service, at }
    └─ include_router(complaints.router, prefix="/api")
       include_router(ai.router, prefix="/api")
```

### Configuration — `config.py`

```python
GROQ_API_KEY         = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL           = "llama-3.1-8b-instant"        # extraction
GROQ_CHAT_MODEL      = "llama-3.3-70b-versatile"     # chat
GROQ_ASSESSMENT_MODEL= "llama-3.3-70b-versatile"     # assessment
DATABASE_URL         = os.getenv("DATABASE_URL", "sqlite:///./complaints.db")
MAX_UPLOAD_MB        = 10
```

---

## 6.3 LangGraph agent — the "brain"

### State — `agent/state.py`

```python
class AgentState(TypedDict, total=False):
    text: Optional[str]           # document text (upload path)
    message: Optional[str]        # chat message (chat path)
    context_form: Dict            # current form values from the frontend
    context_extracted: Dict       # previously extracted values
    fields: Dict                  # extracted/diffed fields
    severity: Optional[str]
    priority: Optional[str]
    recommendation: Optional[str]
    reply: Optional[str]
```

### Graph — `agent/graph.py`

```
        ┌────────────────────────────────────────────────────┐
        │                    START                           │
        └────────────────────────┬───────────────────────────┘
                                 ▼
                          ┌──────────────┐
                          │  extract_node│  ← LLM structured JSON (or heuristics)
                          └──────┬───────┘
                                 │  _route_after_extract
                    ┌────────────┴─────────────┐
                    │                          │
         looks_like_question OR        meaningful complaint fields
         no meaningful fields                 │
                    │                          ▼
                    ▼                    ┌──────────────┐
             ┌──────────────┐            │  assess_node │  ← LLM severity/priority/recommendation
             │  chat_node   │            └──────┬───────┘
             └──────┬───────┘                   ▼
                    │                    ┌──────────────┐
                    │                    │ compose_node │  ← human confirmation message
                    │                    └──────┬───────┘
                    └───────────┬───────────────┘
                                ▼
                             END
```

### Node 1 — `extract_node`

- **Source selection:** `text = state.get("text") or state.get("message")`. Documents use extracted text; chat uses the message.
- **Diff mode:** when a chat message arrives *and* the form is populated, the node asks the LLM to return **only new/changed fields** (`existing` passed to `_llm_extract`). `_diff_fields` then keeps only values that differ from the current form — this is the deterministic merge guarantee: an edit never clobbers untouched fields, even if the LLM echoes current values.

```python
def _diff_fields(fields, existing):
    diff = {}
    for key, value in fields.items():
        if not str(value).strip(): continue
        current = existing.get(EXISTING_KEY_MAP.get(key, key))
        if current is None or str(current).strip() != str(value).strip():
            diff[key] = value
    return diff
```

- **Fallback chain:** structured output (`with_structured_output(method="json_mode")`) → plain JSON (`parse_json`) → `heuristic_extract_fields`.

### Node 2 — `assess_node`

- Builds a **combined** picture (existing form + new fields) so assessment always reflects the full complaint.
- Pure metadata edits (e.g. "batch is ABC-999" with no description/severity/priority) **preserve the existing assessment**:

```python
if is_edit and not (fields.get("description") or fields.get("severity") or fields.get("priority")):
    return {"severity": form.get("severity") or …,
            "priority": form.get("priority") or …,
            "recommendation": form.get("ai_summary") or …}
```

- LLM returns `{severity, priority, recommendation}`; validated against `ALLOWED_SEVERITIES` / `ALLOWED_PRIORITIES`, falling back to `_heuristic_severity` / `_heuristic_priority` keyword scoring.

### Node 3 — `compose_node`

- Writes the user-facing confirmation:

```
New complaint:  "I processed that as a new complaint and extracted the following details: <summary>.
                 Initial severity: <severity>. Priority: <priority>. Review the form on the left, then save to begin triage."
Edit:           "I've updated the complaint with the following new details: <summary>."
```

### Node 4 — `chat_node`

- Conversational triage assistant grounded in form + extracted context.
- Never invents customer/batch/product data; answers only from context or asks a clarifying question.
- **Questions always return `fields: {}`** so a question never writes hallucinated fields to the form.
- Fallback reply if the LLM is unreachable.

### Routing — `_route_after_extract`

```python
if message and (looks_like_question(message) or not _meaningful_fields(state.get("fields"))):
    return "chat"
return "assess"
```

`looks_like_question` (in `nodes.py`) checks for `?`, leading question words (`what/how/why/who/…`), or phrase markers (`can you`, `please`, `summarize`, `assess`, `triage`, …).

---

## 6.4 LLM factory — `agent/llm.py`

```python
def get_llm(model=None, temperature=0.2) -> ChatGroq:
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set. … add it to backend/.env")
    return ChatGroq(model=model or config.GROQ_MODEL, temperature=temperature, api_key=config.GROQ_API_KEY)

get_extraction_llm() → model=GROQ_MODEL,            temperature=0.0
get_assessment_llm() → model=GROQ_ASSESSMENT_MODEL, temperature=0.2
get_chat_llm()       → model=GROQ_CHAT_MODEL,       temperature=0.4
```

The **extraction prompt** defines the exact JSON contract (`ExtractedComplaint` fields), the allowed vocabularies, and date/strength/description rules. When editing, it appends the diff instructions.

---

## 6.5 Normalization & fallback — `agent/normalize.py`

### Canonical label maps (mirror the Express ones)

```
SEVERITY_LABELS     Low/Medium/High/Critical → "… — …" labels
PRIORITY_LABELS     low/normal/high/urgent → "Low"|"Normal"|"High"|"Urgent"
COMPLAINT_TYPE_MAP  appearance/packaging/labeling/contamination/microbial/stability/…
SOURCE_MAP          email/phone/portal/fax/regulatory/distributor/field rep/social → labels
```

### `clean_fields(fields)`

- Keeps the 11 core keys, trims strings, drops `none/null/n/a`.
- Normalizes `severity`, `priority`, `complaint_type`, `complaint_source` to canonical labels.

### `parse_json(raw)`

Robust JSON extraction from an LLM response: tries `json.loads`; on failure regex-extracts `{…}` and retries.

### `heuristic_extract_fields(text)`

Regex fallback (same style as Express `extractFields`): customer/product/batch/strength/quantity/dates/severity/type/source.

---

## 6.6 Text extraction — `services/text_extract.py`

| Extension | Library | Method |
| --- | --- | --- |
| `.txt` | — | `data.decode("utf-8", errors="replace")` |
| `.pdf` | `pypdf` | `PdfReader(BytesIO(data))` → `page.extract_text()` per page, joined by newlines |
| `.docx` | `python-docx` | paragraphs + table cells (`row.cells` joined by `" | "`) |
| `.eml` | stdlib `email` | Subject/From/To headers + `text/plain` body parts |
| other | — | raises `ValueError` → HTTP 400 |

Unlike Express, **DOCX and EML are actually parsed** here (Express uses a canned sample).

---

## 6.7 API routes — `api/ai.py`

### `POST /api/ai/extract`

```
multipart file → read bytes → size check (≤ 10 MB, else 413)
   → extract_text_from_bytes(data, filename)
       │  ValueError      → 400 "Unsupported file type…"
       │  other exception → 400 "Could not read text from the document…"
       │  empty text      → 400 "No readable text found… scanned or image-only PDFs not supported"
       ▼
   agent_graph.invoke({ text, message: None, context_form: {}, context_extracted: {} })
       │
       ▼
   fields = graph.fields + severity + priority + recommendation
   → { fileName, text, fields }
```

### `POST /api/ai/chat` (also aliased `/api/chat`)

```python
payload = ChatRequest(message, context: {form, extracted})
result = agent_graph.invoke({
    text: None,
    message: payload.message,
    context_form: context.form or {},
    context_extracted: context.extracted or {},
})
fields = result.fields + severity + priority + recommendation
return { "reply": result.reply or "No response generated.", "extracted": fields }
```

---

## 6.8 Persistence — `api/complaints.py`

### `POST /api/complaints`

1. `payload = ComplaintCreate(...)` (accepts camelCase or snake_case).
2. Validates required `customer_name`, `product_name`, `batch_number` → else 400.
3. `Complaint().from_payload(payload)` → `db.add` → `commit` → `refresh`.
4. Returns `{ id, status: "pending_triage", message: "Complaint saved." }`.

### `GET /api/complaints`

Ordered `created_at DESC`, serialized via `ComplaintOut.model_dump(by_alias=True)` (camelCase keys).

### Schema — `schemas.py`

`ComplaintBase` is the **single source of truth** for the field contract (snake_case names + camelCase aliases). `ComplaintCreate` = input payload; `ComplaintOut` = + `id`, `status`, `createdAt`, `updatedAt`. `ChatContext`/`ChatRequest` describe the chat payload.

---

## 6.9 Wiring it to the frontend

To switch the UI to the LLM backend:

```js
// frontend/vite.config.js
server: {
  port: 5173,
  proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } }
}
```

Then restart Vite. The frontend needs **no code changes** — `bulkUpdate`'s alias map already accepts the snake_case fields the LLM pipeline emits.