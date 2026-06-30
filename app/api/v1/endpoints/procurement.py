from fastapi import APIRouter, Depends
from app.api.deps import get_current_user_id

router = APIRouter()


@router.get("/vendors")
async def list_vendors(current_user_id: str = Depends(get_current_user_id)):
    """List all vendors."""
    return {"message": "Procurement vendors - coming soon", "module": "procurement"}


@router.post("/vendors")
async def create_vendor(current_user_id: str = Depends(get_current_user_id)):
    """Create a new vendor."""
    return {"message": "Create vendor - coming soon"}


@router.get("/purchase-orders")
async def list_purchase_orders(current_user_id: str = Depends(get_current_user_id)):
    """List all purchase orders."""
    return {"message": "Purchase orders - coming soon"}


@router.post("/purchase-orders")
async def create_purchase_order(current_user_id: str = Depends(get_current_user_id)):
    """Create a new purchase order."""
    return {"message": "Create purchase order - coming soon"}
