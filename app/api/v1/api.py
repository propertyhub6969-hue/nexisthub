from fastapi import APIRouter, Depends
from app.api.v1.endpoints import auth, users, marketing, property, sale, payment, audit, tax, document, kpr, procurement, stock, expense, rab, construction, contractor, legal, reporting, filing, platform, public, billing
from app.api.deps import require_feature, guard
from app.models.user import UserRole

api_router = APIRouter()

# ── Kelompok role (samakan dgn FE utils/access.ts) ──
FULL = (UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)   # akses penuh semua modul
SALES = (*FULL, UserRole.MARKETING)                         # CRM/Properti/Pembayaran/KPR/Pajak/Dokumen
PROD = (*FULL, UserRole.PRODUKSI)                            # Konstruksi/Procurement
V = UserRole.VIEWER                                          # read-only


def feat(*modules: str):
    """Guard feature-flag per modul (Control Plane). feature_flags=None → semua aktif."""
    return Depends(require_feature(*modules))


def g(*write_roles: UserRole, read: tuple = ()):
    """Guard RBAC sadar-metode: write_roles boleh semua method, `read` hanya GET."""
    return Depends(guard(*write_roles, read=read))


api_router.include_router(public.router,      prefix="/public",      tags=["Public"])
api_router.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
api_router.include_router(users.router,       prefix="/team",        tags=["Team"],        dependencies=[g(UserRole.OWNER, UserRole.ADMIN)])
api_router.include_router(marketing.router,   prefix="/marketing",   tags=["Marketing"],   dependencies=[feat("marketing"), g(*SALES, read=(UserRole.FINANCE, V))])
api_router.include_router(property.router,    prefix="/property",    tags=["Property"],    dependencies=[feat("properti"), g(*SALES, read=(UserRole.PRODUKSI, UserRole.FINANCE, V))])
api_router.include_router(sale.router,         prefix="/sales",       tags=["Sales"],       dependencies=[g(*SALES, read=(V,))])
api_router.include_router(payment.router,      prefix="/payments",    tags=["Payments"],    dependencies=[feat("pembayaran"), g(*SALES, UserRole.FINANCE, read=(V,))])
api_router.include_router(audit.router,        prefix="/audit",       tags=["Audit"],       dependencies=[g(*FULL, read=(UserRole.MARKETING, UserRole.PRODUKSI, UserRole.FINANCE, V))])
api_router.include_router(tax.router,          prefix="/legal",       tags=["Legal-Tax"],   dependencies=[feat("pajak"), g(*SALES, read=(V,))])
api_router.include_router(document.router,     prefix="/legal",       tags=["Legal-Docs"],  dependencies=[feat("dokumen"), g(*SALES, read=(V,))])
api_router.include_router(kpr.router,          prefix="/kpr",         tags=["KPR"],         dependencies=[feat("kpr"), g(*SALES, read=(V,))])
api_router.include_router(procurement.router, prefix="/procurement", tags=["Procurement"], dependencies=[feat("procurement"), g(*PROD, read=(V,))])
api_router.include_router(stock.router,        prefix="/procurement", tags=["Stock"],       dependencies=[feat("procurement"), g(*PROD, read=(V,))])
api_router.include_router(expense.router,      prefix="/procurement", tags=["Expense"],     dependencies=[feat("procurement"), g(*PROD, read=(V,))])
api_router.include_router(rab.router,          prefix="/procurement", tags=["RAB"],         dependencies=[feat("rab", "procurement"), g(*PROD, read=(V,))])
api_router.include_router(construction.router, prefix="/construction", tags=["Construction"], dependencies=[feat("konstruksi"), g(*PROD, read=(V,))])
api_router.include_router(contractor.router,   prefix="/construction", tags=["Contractor"],   dependencies=[feat("konstruksi"), g(*PROD, read=(V,))])
api_router.include_router(legal.router,       prefix="/legal",       tags=["Legal"],       dependencies=[g(*SALES, read=(V,))])
api_router.include_router(reporting.router,   prefix="/reporting",   tags=["Reporting"],   dependencies=[feat("laporan"), g(*FULL, read=(UserRole.MARKETING, UserRole.PRODUKSI, UserRole.FINANCE, V))])
api_router.include_router(filing.router,      prefix="/filing",      tags=["Pemberkasan"], dependencies=[feat("dokumen"), g(*SALES, read=(V,))])
api_router.include_router(platform.router,    prefix="/platform",    tags=["Platform"])
api_router.include_router(billing.router,      prefix="/billing",     tags=["Billing"],     dependencies=[g(*FULL)])
