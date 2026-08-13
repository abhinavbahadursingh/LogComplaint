from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from .database import Base
from .schemas import ComplaintCreate


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    complaint_source = Column(String(100), nullable=True)
    customer_name = Column(String(255), nullable=False)
    product_name = Column(String(255), nullable=False)
    product_strength = Column(String(100), nullable=True)
    batch_number = Column(String(100), nullable=False, index=True)
    quantity_affected = Column(String(50), nullable=True)
    manufacturing_date = Column(String(50), nullable=True)
    expiry_date = Column(String(50), nullable=True)
    complaint_type = Column(String(100), nullable=True)
    complaint_date = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    severity = Column(String(120), nullable=True)
    priority = Column(String(50), nullable=True)
    status = Column(String(50), nullable=False, default="pending_triage", index=True)
    ai_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def from_payload(self, payload: ComplaintCreate) -> "Complaint":
        """Build a Complaint from the common Pydantic schema."""
        data = payload.model_dump(by_alias=False)
        for field, value in data.items():
            if value is not None and hasattr(self, field):
                setattr(self, field, value)
        return self