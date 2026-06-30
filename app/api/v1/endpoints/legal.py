from fastapi import APIRouter, Depends
from app.api.deps import get_current_user_id

router = APIRouter()


@router.get("/documents")
async def list_documents(current_user_id: str = Depends(get_current_user_id)):
    """List all legal documents."""
    return {"message": "Legal documents - coming soon", "module": "legal"}


@router.get("/templates")
async def list_templates(current_user_id: str = Depends(get_current_user_id)):
    """List document templates."""
    return {"message": "Document templates - coming soon"}


@router.post("/templates")
async def create_template(current_user_id: str = Depends(get_current_user_id)):
    """Create a document template."""
    return {"message": "Create template - coming soon"}
