import logging

from langchain_groq import ChatGroq

from .. import config

logger = logging.getLogger(__name__)


def get_llm(model: str = None, temperature: float = 0.2) -> ChatGroq:
    if not config.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Create a token at https://console.groq.com "
            "and add it to backend/.env"
        )
    return ChatGroq(
        model=model or config.GROQ_MODEL,
        temperature=temperature,
        api_key=config.GROQ_API_KEY,
    )


def get_extraction_llm() -> ChatGroq:
    return get_llm(config.GROQ_MODEL, temperature=0.0)


def get_assessment_llm() -> ChatGroq:
    return get_llm(config.GROQ_ASSESSMENT_MODEL, temperature=0.2)


def get_chat_llm() -> ChatGroq:
    return get_llm(config.GROQ_CHAT_MODEL, temperature=0.4)