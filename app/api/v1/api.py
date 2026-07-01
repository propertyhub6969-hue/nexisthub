from fastapi import APIRouter
from app.api.v1.endpoints import auth, marketing, property, procurement, legal, reporting

api_router = APIRouter()

api_router.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
api_router.include_router(marketing.router,   prefix="/marketing",   tags=["Marketing"])
api_router.include_router(property.router,    prefix="/property",    tags=["Property"])
api_router.include_router(procurement.router, prefix="/procurement", tags=["Procurement"])
api_router.include_router(legal.router,       prefix="/legal",       tags=["Legal"])
api_router.include_router(reporting.router,   prefix="/reporting",   tags=["Reporting"])
