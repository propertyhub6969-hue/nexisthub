from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import date
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


class ConstructionSummary(BaseModel):
    total_units: int
    avg_percent: float
    done_count: int
    stage_counts: Dict[str, int]


class ConstructionList(BaseModel):
    rows: List[UnitConstructionRow]
    summary: ConstructionSummary
