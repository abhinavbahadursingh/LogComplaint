import json
import logging
import re

from .. import config

logger = logging.getLogger(__name__)

SEVERITY_LABELS = {
    "low": "Low — Minor cosmetic issue",
    "medium": "Medium — Moderate, localized impact",
    "high": "High — Potential safety / regulatory concern",
    "critical": "Critical — Immediate recall consideration",
}

PRIORITY_LABELS = {
    "low": "Low",
    "normal": "Normal",
    "high": "High",
    "urgent": "Urgent",
}

COMPLAINT_TYPE_MAP = {
    "appearance": "Appearance / Visual Defect",
    "packaging": "Packaging Issue",
    "labeling": "Labeling Error",
    "contamination": "Contamination",
    "microbial": "Microbial Issue",
    "stability": "Storage / Stability Concern",
    "storage": "Storage / Stability Concern",
    "dosage": "Strength / Dosage Issue",
    "strength": "Strength / Dosage Issue",
    "effectiveness": "Strength / Dosage Issue",
    "chemical": "Physical / Chemical Property",
    "physical": "Physical / Chemical Property",
    "other": "Other",
}

SOURCE_MAP = {
    "email": "Email",
    "phone": "Phone Call",
    "portal": "Portal / Web form",
    "fax": "Email",
    "regulatory": "Regulatory Body",
    "distributor": "Distributor",
    "field rep": "Field Representative",
    "field-rep": "Field Representative",
    "field_rep": "Field Representative",
    "social": "Social Media",
}


def parse_json(raw) -> dict:
    """Best-effort JSON parsing of an LLM response."""
    if not raw:
        return {}
    if isinstance(raw, list):
        raw = " ".join(str(getattr(chunk, "text", chunk)) for chunk in raw)
    raw = str(raw).strip()
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except (json.JSONDecodeError, ValueError):
                pass
    return {}


def norm_severity(value):
    if not value:
        return None
    v = value.strip()
    key = v.split("—")[0].strip().lower()
    if key in SEVERITY_LABELS:
        return SEVERITY_LABELS[key]
    for k, label in SEVERITY_LABELS.items():
        if k in v.lower():
            return label
    return value


def norm_priority(value):
    if not value:
        return None
    v = value.strip().lower()
    for k, label in PRIORITY_LABELS.items():
        if k in v:
            return label
    return value


def norm_complaint_type(value):
    if not value:
        return None
    v = value.strip().lower()
    for key, label in COMPLAINT_TYPE_MAP.items():
        if key in v:
            return label
    return value


def norm_complaint_source(value):
    if not value:
        return None
    v = value.strip().lower()
    for key, label in SOURCE_MAP.items():
        if key in v:
            return label
    return value


def clean_fields(fields: dict) -> dict:
    """Normalize LLM-extracted fields into the snake_case keys the frontend maps."""
    cleaned = {}
    keys = {
        "complaint_source",
        "customer_name",
        "product_name",
        "product_strength",
        "batch_number",
        "quantity_affected",
        "manufacturing_date",
        "expiry_date",
        "complaint_type",
        "complaint_date",
        "description",
    }
    for key in keys:
        value = fields.get(key)
        if value is None:
            continue
        value = str(value).strip()
        if value and value.lower() not in {"none", "null", "n/a", "na"}:
            cleaned[key] = value

    severity = norm_severity(fields.get("severity"))
    priority = norm_priority(fields.get("priority"))
    complaint_type = norm_complaint_type(fields.get("complaint_type"))
    source = norm_complaint_source(fields.get("complaint_source"))
    if complaint_type:
        cleaned["complaint_type"] = complaint_type
    if source:
        cleaned["complaint_source"] = source
    if severity:
        cleaned["severity"] = severity
    if priority:
        cleaned["priority"] = priority
    return cleaned


def heuristic_extract_fields(text: str) -> dict:
    """Regex-based fallback extraction used when the LLM is unavailable."""
    t = (text or "").lower()
    fields = {}

    def grab(pattern, key):
        m = pattern.search(t)
        if m:
            value = m.group(len(m.groups()))  # last capture group holds the value
            if value:
                fields[key] = value.strip()

    grab(re.compile(r"(customer|client|company)\s*[:=\-]\s*([a-z0-9 ]{3,60})"), "customer_name")
    grab(re.compile(r"product(?:\s*name)?\s*[:=\-]\s*([a-z0-9 ]{3,60})"), "product_name")
    grab(re.compile(r"(?:batch|lot)\s*(?:number)?\s*[:=\-]\s*([a-z0-9-]{3,30})"), "batch_number")
    grab(re.compile(r"(strength|grade)\s*[:=\-]\s*([0-9a-z/ .-]{1,20})"), "product_strength")
    grab(re.compile(r"(quantity|qty)\s*[:=\-]\s*(\d+(?:\.\d+)?)"), "quantity_affected")
    grab(
        re.compile(r"(manufactur(?:ed|ing)?|mfg)\s*date\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})"),
        "manufacturing_date",
    )
    grab(
        re.compile(r"exp(?:ir)?y?\s*date\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})"),
        "expiry_date",
    )
    grab(
        re.compile(r"complaint\s*(?:date)?\s*[:=\-]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})"),
        "complaint_date",
    )

    severity_m = re.search(r"severity\s*[:=\-]\s*(\w+)", t)
    if severity_m:
        level = severity_m.group(1).lower()
        if "crit" in level or "high" in level:
            fields["severity"] = SEVERITY_LABELS["high"]
        elif "medium" in level or "moderate" in level:
            fields["severity"] = SEVERITY_LABELS["medium"]
        elif "low" in level:
            fields["severity"] = SEVERITY_LABELS["low"]

    type_m = re.search(
        r"(appearance|packaging|labeling|contamin|microbial|stability|storage|dosage|effectiveness|other)(?:\s*(issue|problem|concern))?",
        t,
    )
    if type_m:
        fields["complaint_type"] = COMPLAINT_TYPE_MAP.get(type_m.group(1), "Other")

    source_m = re.search(r"(\[|\()(email|phone|portal|fax|regulatory|distributor|field[ -]?rep)(\]|\))", t)
    if source_m:
        fields["complaint_source"] = SOURCE_MAP.get(source_m.group(2).lower(), source_m.group(2).title())

    return clean_fields(fields)