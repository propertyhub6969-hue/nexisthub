"""Regenerate router subdomain per-tenant Traefik dari backend (Control Plane).

File ditulis ke direktori dynamic Traefik yang di-mount (PROXY_DYNAMIC_DIR).
Aman: bila dir tak ada (mis. dev/local) → dilewati diam-diam. Penulisan atomic.
Slug berasal dari slugify (hanya a-z0-9-), jadi aman untuk aturan Host Traefik.
"""
import os
import tempfile
from sqlalchemy import select
from app.models.tenant import Tenant

PROXY_DIR = os.getenv("PROXY_DYNAMIC_DIR", "/proxy-dynamic")
OUT_NAME = "nexisthub-tenants.yaml"


def _yaml_for(slugs) -> str:
    lines = [
        "# AUTO-GENERATED oleh backend NexistHub (Control Plane) — JANGAN edit manual.",
        "# Router <slug>.nexisthub.id -> nexisthub-svc (didefinisikan di nexisthub.yaml).",
        "http:",
        "  routers:",
    ]
    for s in slugs:
        lines += [
            f"    tenant-{s}-http:",
            f"      rule: \"Host(`{s}.nexisthub.id`)\"",
            "      entryPoints: [http]",
            "      middlewares: [redirect-to-https]",
            "      service: nexisthub-svc",
            "      priority: 100",
            f"    tenant-{s}-https:",
            f"      rule: \"Host(`{s}.nexisthub.id`)\"",
            "      entryPoints: [https]",
            "      service: nexisthub-svc",
            "      priority: 100",
            "      tls: { certResolver: letsencrypt }",
        ]
    return "\n".join(lines) + "\n"


async def regenerate_tenant_routes(db) -> bool:
    """Tulis ulang file router subdomain dari semua tenant (kecuali 'platform'). Return True bila ditulis."""
    if not os.path.isdir(PROXY_DIR):
        return False  # dir proxy tak di-mount → lewati
    rows = (await db.execute(
        select(Tenant.slug).where(Tenant.slug != "platform", Tenant.is_deleted == False)  # noqa: E712
        .order_by(Tenant.slug)
    )).all()
    slugs = [r[0] for r in rows if r[0]]
    content = _yaml_for(slugs)
    fd, tmp = tempfile.mkstemp(dir=PROXY_DIR, prefix=".tenants-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
        os.replace(tmp, os.path.join(PROXY_DIR, OUT_NAME))  # atomic
        return True
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
