from fastapi import APIRouter, Depends
from app.api.deps import get_current_user_id

router = APIRouter()


@router.get("/leads")
async def list_leads(current_user_id: str = Depends(get_current_user_id)):
    """List all leads for the current tenant."""
    # TODO Session 2+: implement with DB
    return {"message": "Marketing leads - coming soon", "module": "marketing"}


@router.post("/leads")
async def create_lead(current_user_id: str = Depends(get_current_user_id)):
    """Create a new lead."""
    return {"message": "Create lead - coming soon"}


@router.get("/prospects")
async def list_prospects(current_user_id: str = Depends(get_current_user_id)):
    """List all prospects."""
    return {"message": "Marketing prospects - coming soon"}


@router.get("/clients")
async def list_clients(current_user_id: str = Depends(get_current_user_id)):
    """List all clients."""
    return {"message": "Marketing clients - coming soon"}
