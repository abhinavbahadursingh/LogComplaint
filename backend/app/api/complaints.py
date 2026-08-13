from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Complaint
from ..schemas import ComplaintCreate, ComplaintOut, REQUIRED_FIELDS

router = APIRouter()


@router.post("/complaints", status_code=201)
def create_complaint(payload: ComplaintCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(by_alias=False)
    missing = [f for f in REQUIRED_FIELDS if not data.get(f)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="customerName, productName and batchNumber are required.",
        )

    complaint = Complaint().from_payload(payload)
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return {
        "id": complaint.id,
        "status": complaint.status,
        "message": "Complaint saved.",
    }


@router.get("/complaints")
def list_complaints(db: Session = Depends(get_db)):
    complaints = (
        db.query(Complaint)
        .order_by(Complaint.created_at.desc())
        .all()
    )
    return {
        "complaints": [
            ComplaintOut.model_validate(c).model_dump(by_alias=True)
            for c in complaints
        ]
    }