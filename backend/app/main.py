from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import ai, complaints
from .database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Customer Complaint Intake API",
    description="FastAPI + LangGraph + Groq backend for the customer complaint intake system.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "customer-complaint",
        "at": datetime.now(timezone.utc).isoformat(),
    }


app.include_router(complaints.router, prefix="/api")
app.include_router(ai.router, prefix="/api")