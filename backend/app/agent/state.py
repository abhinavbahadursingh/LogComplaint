from typing import Dict, Optional, TypedDict


class AgentState(TypedDict, total=False):
    text: Optional[str]
    message: Optional[str]
    context_form: Dict
    context_extracted: Dict
    fields: Dict
    severity: Optional[str]
    priority: Optional[str]
    recommendation: Optional[str]
    reply: Optional[str]