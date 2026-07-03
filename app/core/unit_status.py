from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.marketing import Client, ClientStatus
from app.models.property import Unit, UnitStatus


def unit_status_for_client(client: Client) -> UnitStatus:
    """Status unit yang seharusnya berdasarkan status pembeli."""
    if client.status == ClientStatus.INACTIVE:
        return UnitStatus.AVAILABLE
    if client.status == ClientStatus.COMPLETED:
        return UnitStatus.SOLD
    return UnitStatus.BOOKED  # active → dipesan


async def set_unit_status(db: AsyncSession, tenant_id, unit_id, new_status: UnitStatus) -> None:
    if not unit_id:
        return
    u = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id))).scalar_one_or_none()
    if u:
        u.status = new_status
