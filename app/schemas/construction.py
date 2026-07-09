from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import date, datetime
import uuid

from app.models.construction import ConstructionStage


class ConstructionUpsert(BaseModel):
    stage: Optional[ConstructionStage] = None
    percent: Optional[int] = Field(None, ge=0, le=100)
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    finish_date: Optional[date] = None
    notes: Optional[str] = None


class UnitConstructionRow(BaseModel):
    unit_id: uuid.UUID
    unit_label: str
    unit_type: Optional[str] = None
    stage: ConstructionStage
    percent: int
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    finish_date: Optional[date] = None
    notes: Optional[str] = None
    last_log_date: Optional[date] = None  # entri log progres terbaru — dasar hitung "terlambat"


class ConstructionSummary(BaseModel):
    total_units: int
    avg_percent: float
    done_count: int
    stage_counts: Dict[str, int]


class ConstructionList(BaseModel):
    rows: List[UnitConstructionRow]
    summary: ConstructionSummary


class ProgressLogResponse(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    log_date: date
    stage: Optional[ConstructionStage] = None
    percent: Optional[int] = None
    notes: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    has_photo: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
