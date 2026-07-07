from fastapi import APIRouter, Depends
from app.api.v1.endpoints import auth, users, marketing, property, sale, payment, audit, tax, document, kpr, procurement, stock, expense, rab, construction, contractor, legal, reporting, filing, platform
from app.api.deps import require_role, require_feature
from app.models.user import UserRole

api_router = APIRouter()

# Area Produksi (Konstruksi & Procurement) — hanya role ini yang boleh (samakan dgn FE utils/access.ts).
PROD_ROLES = (UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.PRODUKSI)
prod_guard = Depends(require_role(*PROD_ROLES))


def feat(*modules: str):
    """Guard feature-flag per modul (Control Plane). feature_flags=None → semua aktif."""
    return Depends(require_feature(*modules))


api_router.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
api_router.include_router(users.router,       prefix="/team",        tags=["Team"])
api_router.include_router(marketing.router,   prefix="/marketing",   tags=["Marketing"],   dependencies=[feat("marketing")])
api_router.include_router(property.router,    prefix="/property",    tags=["Property"],    dependencies=[feat("properti")])
api_router.include_router(sale.router,         prefix="/sales",       tags=["Sales"])
api_router.include_router(payment.router,      prefix="/payments",    tags=["Payments"],    dependencies=[feat("pembayaran")])
api_router.include_router(audit.router,        prefix="/audit",       tags=["Audit"])
api_router.include_router(tax.router,          prefix="/legal",       tags=["Legal-Tax"],   dependencies=[feat("pajak")])
api_router.include_router(document.router,     prefix="/legal",       tags=["Legal-Docs"],  dependencies=[feat("dokumen")])
api_router.include_router(kpr.router,          prefix="/kpr",         tags=["KPR"],         dependencies=[feat("kpr")])
api_router.include_router(procurement.router, prefix="/procurement", tags=["Procurement"], dependencies=[prod_guard, feat("procurement")])
api_router.include_router(stock.router,        prefix="/procurement", tags=["Stock"],       dependencies=[prod_guard, feat("procurement")])
api_router.include_router(expense.router,      prefix="/procurement", tags=["Expense"],     dependencies=[prod_guard, feat("procurement")])
api_router.include_router(rab.router,          prefix="/procurement", tags=["RAB"],         dependencies=[prod_guard, feat("rab", "procurement")])
api_router.include_router(construction.router, prefix="/construction", tags=["Construction"], dependencies=[prod_guard, feat("konstruksi")])
api_router.include_router(contractor.router,   prefix="/construction", tags=["Contractor"],   dependencies=[prod_guard, feat("konstruksi")])
api_router.include_router(legal.router,       prefix="/legal",       tags=["Legal"])
api_router.include_router(reporting.router,   prefix="/reporting",   tags=["Reporting"],   dependencies=[feat("laporan")])
api_router.include_router(filing.router,      prefix="/filing",      tags=["Pemberkasan"], dependencies=[feat("dokumen")])
api_router.include_router(platform.router,    prefix="/platform",    tags=["Platform"])
