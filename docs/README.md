# Customer Complaint Intake & QA Module — Documentation Index

A dark, enterprise-grade SaaS dashboard for logging pharmaceutical **customer complaints** and running a quality-assurance (QA) triage flow. It combines a structured intake form with an **AI Intake Co-pilot** that extracts complaint data from uploaded documents (or pasted emails), auto-generates risk analysis and CAPA recommendations, checks record completeness, flags duplicate complaints, and recommends root-cause investigation paths.

---

## Quick glance

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         BROWSER  (:5173)                               │
 │   React 18 · Redux Toolkit · Vite 6                                    │
 │                                                                        │
 │   ┌─────────────── LEFT COLUMN ──────────────┐  ┌─ RIGHT COLUMN ──────┐ │
 │   │  ComplaintForm                           │  │  AiAssistant        │ │
 │   │  ComplaintAnalysis (summary·risk·CAPA)   │  │  RootCause          │ │
 │   │  CompletenessChecker                     │  │  DuplicateDetector  │ │
 │   └──────────────────────────────────────────┘  └─────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────┘
        │  fetch("/api/...")   (proxied by Vite)
        ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │  ACTIVE:  Express API (:3001)   ·   ALT: FastAPI+LangGraph+Groq (:8000)│
 │  heuristic engines               LLM-powered, not wired to the UI      │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Documentation map

Read in order, or jump straight to a topic:

| # | File | Covers |
| --- | --- | --- |
| 1 | [`01-architecture.md`](01-architecture.md) | System architecture: component topology, ASCII + Mermaid diagrams, request/sequence flows |
| 2 | [`02-project-structure.md`](02-project-structure.md) | Every folder and file in the repository, explained |
| 3 | [`03-data-model.md`](03-data-model.md) | Complaint fields, required/optional rules, saved record shapes, alias mapping, canonical values |
| 4 | [`04-frontend-design.md`](04-frontend-design.md) | Redux store, both slices, Dashboard layout, each component, design system |
| 5 | [`05-backend-express.md`](05-backend-express.md) | The active Express backend: middleware, all heuristic engines, routes |
| 6 | [`06-backend-fastapi.md`](06-backend-fastapi.md) | The alternative FastAPI + LangGraph + Groq backend |
| 7 | [`07-features.md`](07-features.md) | Step-by-step walkthrough of every feature with visuals |
| 8 | [`08-api-reference.md`](08-api-reference.md) | Full API reference for both backends with example requests/responses |
| 9 | [`09-setup-configuration.md`](09-setup-configuration.md) | Getting started, environment setup, configuration tables |
| 10 | [`10-limitations.md`](10-limitations.md) | Known limitations and future work |

---

## 60-second quick start

```bash
# 1. Start the active backend (Express)
cd backend
npm install
npm run dev          # → http://localhost:3001

# 2. Start the frontend (separate terminal)
cd frontend
npm install
npm run dev          # → http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies every `/api/*` request to Express on `:3001`.

### Fastest demo

Paste this into the co-pilot chat (or upload `backend/test_complaint.pdf`):

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

The form auto-fills, the analysis/completeness/root-cause/duplicate panels react, and you can ask the co-pilot triage questions.

---

## Feature summary

| Feature | Where | Backend engine |
| --- | --- | --- |
| Structured complaint intake | `ComplaintForm` | `POST /api/complaints` |
| Document upload (PDF/DOCX/TXT/EML) + extraction | `AiAssistant` | `POST /api/ai/extract` |
| Paste raw email / text | `AiAssistant` | `POST /api/ai/extract` (as `.txt`) |
| AI Co-pilot chat (triage Q&A + NL form edits) | `AiAssistant` | `POST /api/ai/chat` |
| AI Complaint Analysis (summary · risk · CAPA) | `ComplaintAnalysis` | `POST /api/ai/analysis` |
| Completeness Checker | `CompletenessChecker` | `POST /api/ai/completeness` (also in chat) |
| Duplicate Complaint Detection | `DuplicateDetector` | `POST /api/ai/duplicates` |
| Root Cause Recommendation | `RootCause` | `POST /api/ai/root-cause` |
| Saved complaints / ledger | in-memory `Map` | `GET/POST /api/complaints` |

> **Note on the "AI"** — the active Express backend runs a **heuristic engine** (regex + keyword scoring), so the whole pipeline works offline end-to-end with zero API keys. A separate LLM-powered backend (FastAPI + LangGraph + Groq) ships in `backend/app/` but is **not wired to the frontend**.
