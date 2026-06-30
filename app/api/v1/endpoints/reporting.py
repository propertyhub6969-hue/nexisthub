from fastapi import APIRouter, Depends
from app.api.deps import get_current_user_id

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(current_user_id: str = Depends(get_current_user_id)):
    """Get dashboard summary data."""
    return {"message": "Dashboard reporting - coming soon", "module": "reporting"}


@router.get("/reports")
async def list_reports(current_user_id: str = Depends(get_current_user_id)):
    """List saved reports."""
    return {"message": "Reports list - coming soon"}


@router.post("/reports")
async def create_report(current_user_id: str = Depends(get_current_user_id)):
    """Create a new report configuration."""
    return {"message": "Create report - coming soon"}
