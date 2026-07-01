import json
from typing import Optional
from app.models.audit import AuditLog

# field besar/sensitif yang tak perlu masuk log
_SKIP_FIELDS = {"signature"}


def _dump(data) -> Optional[str]:
    if data is None:
        return None
    if hasattr(data, "model_dump"):
        data = data.model_dump(mode="json", exclude_unset=True)
    if isinstance(data, dict):
        data = {k: v for k, v in data.items() if k not in _SKIP_FIELDS}
    return json.dumps(data, default=str)


async def record_audit(db, tenant_id, user_id, action: str, resource: str,
                       resource_id=None, old_data=None, new_data=None):
    """Catat satu baris audit. Non-blocking terhadap alur utama."""
    log = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=str(resource_id) if resource_id else None,
        old_data=_dump(old_data),
        new_data=_dump(new_data),
    )
    db.add(log)
