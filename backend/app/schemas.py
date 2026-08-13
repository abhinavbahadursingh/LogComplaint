from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

REQUIRED_FIELDS = ("customer_name", "product_name", "batch_number")


class ComplaintBase(BaseModel):
    """Single source of truth for the complaint record.

    Both the DB (SQLAlchemy) and the API (Pydantic) use this field contract.
    Field names are snake_case; the frontend camelCase aliases are accepted on
    input (populate_by_name) and emitted on output (by_alias).
    """

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    complaint_source: Optional[str] = Field(default=None, alias="complaintSource")
    customer_name: Optional[str] = Field(default=None, alias="customerName")
    product_name: Optional[str] = Field(default=None, alias="productName")
    product_strength: Optional[str] = Field(default=None, alias="productStrength")
    batch_number: Optional[str] = Field(default=None, alias="batchNumber")
    quantity_affected: Optional[str] = Field(default=None, alias="quantityAffected")
    manufacturing_date: Optional[str] = Field(default=None, alias="manufacturingDate")
    expiry_date: Optional[str] = Field(default=None, alias="expiryDate")
    complaint_type: Optional[str] = Field(default=None, alias="complaintType")
    complaint_date: Optional[str] = Field(default=None, alias="complaintDate")
    description: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None
    ai_summary: Optional[str] = Field(default=None, alias="aiSummary")


class ComplaintCreate(ComplaintBase):
    """Payload used when saving a new complaint from the intake form."""


class ComplaintOut(ComplaintBase):
    """Payload returned when reading a complaint from the database."""

    id: int
    status: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class ChatContext(BaseModel):
    form: Optional[Dict] = None
    extracted: Optional[Dict] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[ChatContext] = None