import logging
import re
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from .llm import get_assessment_llm, get_chat_llm, get_extraction_llm
from .normalize import clean_fields, heuristic_extract_fields, parse_json
from .state import AgentState

logger = logging.getLogger(__name__)

LEADING_QUESTION_WORDS = re.compile(
    r"^(what|how|why|who|when|which|where|can|could|is|are|do|does|should|would)\b",
    re.IGNORECASE,
)

PHRASE_MARKERS = re.compile(
    r"\b(can you|could you|please|give me|tell me|help me|summarize|summary|"
    r"assess|triage|investigation steps|investigate|recommend|suggest|"
    r"severity of|priority of|explain)\b",
    re.IGNORECASE,
)


def looks_like_question(message: str) -> bool:
    """Heuristic: is the chat message a question rather than a complaint paragraph?"""
    msg = (message or "").strip()
    if not msg:
        return False
    if "?" in msg:
        return True
    if LEADING_QUESTION_WORDS.match(msg):
        return True
    return bool(PHRASE_MARKERS.search(msg))


class ExtractedComplaint(BaseModel):
    """JSON contract the LLM must return so the intake form can be auto-filled.

    Mirrors the common complaint schema (app.schemas.ComplaintBase) exactly.
    Every key must be present; use empty string when a detail is not in the text.
    """

    complaint_source: Optional[str] = None
    customer_name: Optional[str] = None
    product_name: Optional[str] = None
    product_strength: Optional[str] = None
    batch_number: Optional[str] = None
    quantity_affected: Optional[str] = None
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None
    complaint_type: Optional[str] = None
    complaint_date: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None

ALLOWED_SEVERITIES = [
    "Low — Minor cosmetic issue",
    "Medium — Moderate, localized impact",
    "High — Potential safety / regulatory concern",
    "Critical — Immediate recall consideration",
]
ALLOWED_PRIORITIES = ["Low", "Normal", "High", "Urgent"]
ALLOWED_TYPES = [
    "Appearance / Visual Defect",
    "Packaging Issue",
    "Labeling Error",
    "Strength / Dosage Issue",
    "Contamination",
    "Physical / Chemical Property",
    "Microbial Issue",
    "Storage / Stability Concern",
    "Other",
]
ALLOWED_SOURCES = [
    "Portal / Web form",
    "Email",
    "Phone Call",
    "Field Representative",
    "Distributor",
    "Regulatory Body",
    "Social Media",
]


def _meaningful_fields(fields: dict) -> bool:
    return any(str(v).strip() for v in (fields or {}).values())


# Frontend form (camelCase) key -> extraction schema (snake_case) key.
EXISTING_KEY_MAP = {
    "complaint_source": "complaintSource",
    "customer_name": "customerName",
    "product_name": "productName",
    "product_strength": "productStrength",
    "batch_number": "batchNumber",
    "quantity_affected": "quantityAffected",
    "manufacturing_date": "manufacturingDate",
    "expiry_date": "expiryDate",
    "complaint_type": "complaintType",
    "complaint_date": "complaintDate",
    "description": "description",
    "severity": "severity",
    "priority": "priority",
}


def _diff_fields(fields: dict, existing: dict) -> dict:
    """Keep only fields that are new or differ from the existing form values.

    This is the deterministic merge guarantee: an edit never clobbers fields the
    user did not mention, even if the LLM echoed current values back.
    """
    diff = {}
    for key, value in fields.items():
        if not str(value).strip():
            continue
        current = existing.get(EXISTING_KEY_MAP.get(key, key))
        if current is None or str(current).strip() != str(value).strip():
            diff[key] = value
    return diff


def extract_node(state: AgentState) -> AgentState:
    """Route every prompt through the LLM so it returns schema-format JSON.

    - Chat message (no uploaded doc): the message itself becomes the source text.
      When the form is already populated, the LLM is asked for a DIFF — only the
      fields the user's new message provides or changes.
    - Uploaded document: the parsed document text becomes the source text.
    """
    text = state.get("text") or state.get("message")

    if not text or not str(text).strip():
        return {"fields": dict(state.get("context_extracted") or {})}

    form = state.get("context_form") or {}
    existing = {k: v for k, v in form.items() if v} if state.get("message") else None

    try:
        fields = _llm_extract(str(text), existing=existing)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM extraction failed (%s); using heuristics.", exc)
        fields = heuristic_extract_fields(str(text))
    if existing:
        fields = _diff_fields(fields, existing)
    return {"fields": fields}


def _llm_extract(text: str, existing: Optional[dict] = None) -> dict:
    """Ask the LLM for JSON matching ExtractedComplaint, then normalize it.

    Falls back to plain JSON, then heuristics, if structured output fails.
    When `existing` form values are given, the LLM returns a DIFF (only new or
    changed fields) so untouched form values are preserved.
    """
    llm = get_extraction_llm()
    schema_hint = ", ".join(ExtractedComplaint.model_fields.keys())
    system = (
        "You are a data extraction engine for pharmaceutical customer complaint intake. "
        "From the user's text, extract the complaint details and return a single valid "
        "JSON object whose keys are EXACTLY and ONLY these:\n"
        f"{schema_hint}\n\n"
        "Rules:\n"
        f"- complaint_source: one of {ALLOWED_SOURCES}; empty string if unknown.\n"
        f"- complaint_type: one of {ALLOWED_TYPES}; empty string if unknown.\n"
        f"- severity: one of {ALLOWED_SEVERITIES}.\n"
        f"- priority: one of {ALLOWED_PRIORITIES}, derived from severity and risk wording.\n"
        "- product_strength: e.g. \"250 mg / USP Grade\".\n"
        "- dates exactly as written in the text (DD/MM/YYYY or YYYY-MM-DD).\n"
        "- description: concise 1-3 sentence summary of the complaint details.\n"
        "- Return valid JSON only — no markdown, no commentary."
    )

    if existing:
        current = ", ".join(f"{k}={v}" for k, v in existing.items() if v)
        system += (
            "\n\nThe complaint form is ALREADY populated with these values:\n"
            f"{{{current}}}\n"
            "The user is now EDITING / updating the complaint. Return ONLY the fields that "
            "are newly provided or changed by the user's message. Every other field must be "
            "an empty string so existing values are preserved. Do not repeat values that are "
            "already present and unchanged."
        )
    else:
        system += (
            "\n\nThe complaint form is empty. Extract every field you can determine; use an "
            "empty string for fields that are not present in the text."
        )

    messages = [SystemMessage(content=system), HumanMessage(content=text)]

    try:
        structured = llm.with_structured_output(ExtractedComplaint, method="json_mode")
        parsed = structured.invoke(messages)
        if parsed is not None:
            return clean_fields(parsed.model_dump())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Structured extraction failed (%s); retrying as plain JSON.", exc)

    response = llm.invoke(messages)
    return clean_fields(parse_json(response.content))


def assess_node(state: AgentState) -> AgentState:
    fields = state.get("fields") or {}
    form = state.get("context_form") or {}
    is_edit = bool(state.get("message")) and any(v for v in form.values())

    # Pure metadata edit (e.g. "batch is ABC-999"): preserve existing assessment.
    if is_edit and not (
        fields.get("description") or fields.get("severity") or fields.get("priority")
    ):
        return {
            "severity": form.get("severity") or fields.get("severity"),
            "priority": form.get("priority") or fields.get("priority"),
            "recommendation": form.get("ai_summary") or form.get("aiSummary"),
        }

    # Combine current form values with the new/changed fields so the assessment
    # always works against the full picture.
    combined = {
        "description": fields.get("description") or form.get("description"),
        "product_name": fields.get("product_name") or form.get("productName"),
        "batch_number": fields.get("batch_number") or form.get("batchNumber"),
        "customer_name": fields.get("customer_name") or form.get("customerName"),
        "complaint_type": fields.get("complaint_type") or form.get("complaintType"),
        "complaint_source": fields.get("complaint_source") or form.get("complaintSource"),
        "quantity_affected": fields.get("quantity_affected") or form.get("quantityAffected"),
        "severity": fields.get("severity") or form.get("severity"),
        "priority": fields.get("priority") or form.get("priority"),
    }
    description = combined.get("description") or ""
    product = combined.get("product_name") or "the product"
    batch = combined.get("batch_number") or "unknown batch"

    try:
        result = _llm_assess(combined, description, product)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM assessment failed (%s); using heuristics.", exc)
        result = {}

    severity = result.get("severity") or _heuristic_severity(description)
    priority = result.get("priority") or _heuristic_priority(description)
    recommendation = result.get("recommendation") or (
        f"Open an investigation for {product} (batch {batch}), document findings, "
        "and route per severity for disposition."
    )
    return {
        "severity": severity,
        "priority": priority,
        "recommendation": recommendation,
    }


def _llm_assess(fields: dict, description: str, product: str) -> dict:
    llm = get_assessment_llm()
    system = (
        "You are a pharmaceutical QA/regulatory specialist performing initial risk "
        "assessment of a customer complaint. Given the complaint fields below, return a "
        "single valid JSON object with keys: severity, priority, recommendation.\n"
        f"- severity: exactly one of {ALLOWED_SEVERITIES}.\n"
        f"- priority: exactly one of {ALLOWED_PRIORITIES}.\n"
        "- recommendation: 1-2 sentences of next steps for the investigator.\n"
        "Return valid JSON only."
    )
    context = {
        k: v for k, v in fields.items() if v
    }
    user = (
        f"Complaint fields: {context}\n\n"
        f"Description: {description or 'not provided'}\n"
        f"Product: {product}"
    )
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    data = parse_json(response.content)
    severity = data.get("severity")
    priority = data.get("priority")
    if severity not in ALLOWED_SEVERITIES:
        severity = _heuristic_severity(description)
    if priority not in ALLOWED_PRIORITIES:
        priority = _heuristic_priority(description)
    return {
        "severity": severity,
        "priority": priority,
        "recommendation": data.get("recommendation"),
    }


def _heuristic_severity(text: str) -> str:
    t = (text or "").lower()
    if any(k in t for k in ("recall", "life-threat", "death", "injur", "critical")):
        return ALLOWED_SEVERITIES[3]
    if any(k in t for k in ("safety", "regulatory", "contamin", "microbial", "sterility", "high")):
        return ALLOWED_SEVERITIES[2]
    if any(k in t for k in ("medium", "moderate")):
        return ALLOWED_SEVERITIES[1]
    return ALLOWED_SEVERITIES[0]


def _heuristic_priority(text: str) -> str:
    t = (text or "").lower()
    if any(k in t for k in ("recall", "urgent", "critical", "injur", "death", "safety")):
        return "Urgent"
    if any(k in t for k in ("high", "contamin", "microbial", "sterility")):
        return "High"
    if any(k in t for k in ("medium", "moderate")):
        return "Normal"
    return "Low"


def chat_node(state: AgentState) -> AgentState:
    message = state.get("message") or ""
    form = state.get("context_form") or {}
    extracted = state.get("context_extracted") or {}

    context_lines = []
    for label, source in (("Submitted form", form), ("Extracted document", extracted)):
        values = {k: v for k, v in (source or {}).items() if v}
        if values:
            context_lines.append(f"{label}: {values}")
    context_block = "\n".join(context_lines) or "No complaint context has been provided yet."

    system = (
        "You are the Intake Co-pilot, an AI assistant embedded in a pharmaceutical "
        "customer complaint intake system. Help quality/compliance staff work through "
        "a complaint: summarize it, guide severity/priority triage, and suggest "
        "investigation steps (hold-and-test, CAPA intake, batch release review).\n"
        "Be concise, professional, and grounded in the complaint context. If the answer "
        "is not in the context, say so and ask a clarifying question. Never invent "
        "customer, batch, or product data."
    )
    user = (
        f"Complaint context:\n{context_block}\n\n"
        f"Staff question: {message}"
    )
    try:
        response = get_chat_llm().invoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        reply = response.content if isinstance(response.content, str) else str(response.content)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM chat failed (%s).", exc)
        reply = (
            "I could not reach the language model right now. Please try again in a "
            "moment, or ask for a summary / severity guidance using the on-form data."
        )
    # Questions never write extracted details to the form — clear any hallucinated fields.
    return {"reply": reply, "fields": {}}


def _human_summary(fields: dict) -> str:
    """Readable one-line summary of extracted complaint fields."""
    parts = []
    if fields.get("customer_name"):
        parts.append(f"customer \"{fields['customer_name']}\"")
    if fields.get("product_name"):
        strength = f" ({fields['product_strength']})" if fields.get("product_strength") else ""
        parts.append(f"product \"{fields['product_name']}{strength}\"")
    if fields.get("batch_number"):
        parts.append(f"batch {fields['batch_number']}")
    if fields.get("complaint_type"):
        parts.append(f"type \"{fields['complaint_type']}\"")
    if fields.get("complaint_source"):
        parts.append(f"reported via {fields['complaint_source']}")
    summary = "; ".join(parts) if parts else "no structured fields found"
    return summary


def compose_node(state: AgentState) -> AgentState:
    """Confirm to the user when a pasted complaint was processed via the chat."""
    message = state.get("message")
    if not message:
        return {"reply": ""}

    fields = state.get("fields") or {}
    form = state.get("context_form") or {}
    is_edit = bool(form.get("customerName") or form.get("customer_name")
                   or form.get("productName") or form.get("product_name")
                   or form.get("batchNumber") or form.get("batch_number"))
    summary = _human_summary(fields)
    severity = state.get("severity") or fields.get("severity") or form.get("severity")
    priority = state.get("priority") or fields.get("priority") or form.get("priority")

    if is_edit:
        reply = f"I've updated the complaint with the following new details: {summary}."
    else:
        reply = (
            f"I processed that as a new complaint and extracted the following details: "
            f"{summary}."
        )
    if severity:
        reply += f" Initial severity: {severity}."
    if priority:
        reply += f" Priority: {priority}."
    reply += " Review the form on the left, then save to begin triage."
    return {"reply": reply}