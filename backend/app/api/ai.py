from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import config
from ..agent.graph import agent_graph
from ..schemas import ChatRequest
from ..services.text_extract import extract_text_from_bytes

router = APIRouter()


@router.post("/ai/extract")
def extract_document(file: UploadFile = File(...)):
    data = file.file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds upload limit.")
    try:
        text = extract_text_from_bytes(data, file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in the document.")

    result = agent_graph.invoke(
        {
            "text": text,
            "message": None,
            "context_form": {},
            "context_extracted": {},
        }
    )
    fields = dict(result.get("fields") or {})
    if result.get("severity"):
        fields["severity"] = result["severity"]
    if result.get("priority"):
        fields["priority"] = result["priority"]
    if result.get("recommendation"):
        fields["recommendation"] = result["recommendation"]

    return {"fileName": file.filename, "text": text, "fields": fields}


@router.post("/ai/chat")
def chat(payload: ChatRequest):
    context = payload.context
    result = agent_graph.invoke(
        {
            "text": None,
            "message": payload.message,
            "context_form": context.form if context else {},
            "context_extracted": context.extracted if context else {},
        }
    )
    return {
        "reply": result.get("reply") or "No response generated.",
        "extracted": result.get("fields") or {},
    }