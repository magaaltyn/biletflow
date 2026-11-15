from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import can_manage_event, get_current_user, get_organizer_profile, is_admin
from app.core.errors import bad_request, not_found
from app.database.session import get_db
from app.models import Event, Order, StaffAssignment, StaffRole, SupportCase, SupportCategory, SupportMessage, SupportStatus, User
from app.services.audit import audit
from app.services.notifications import notify
from app.services.serializers import paginate, support_case_out

router = APIRouter(prefix="/support", tags=["support"])


class CaseIn(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    category: SupportCategory
    message: str = Field(min_length=2, max_length=5000)
    event_id: int | None = None
    order_id: int | None = None


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class StatusIn(BaseModel):
    status: SupportStatus


def is_staff_for(db: Session, user: User, case: SupportCase) -> bool:
    """Platform admins, or the organizer / event admins of the related event."""
    if is_admin(user):
        return True
    return bool(case.event and can_manage_event(db, user, case.event))


def _load(db: Session, user: User, case_id: int) -> tuple[SupportCase, bool]:
    c = db.get(SupportCase, case_id)
    if not c:
        raise not_found("Support case not found")
    staff = is_staff_for(db, user, c)
    if c.user_id != user.id and not staff:
        raise not_found("Support case not found")
    return c, staff


@router.get("/cases")
def list_cases(scope: str = Query("mine", pattern="^(mine|staff)$"), status: str | None = None, page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(SupportCase)
    if scope == "mine":
        stmt = stmt.where(SupportCase.user_id == user.id)
    elif not is_admin(user):
        profile = get_organizer_profile(db, user)
        managed = select(StaffAssignment.event_id).where(StaffAssignment.user_id == user.id, StaffAssignment.role == StaffRole.event_admin)
        cond = SupportCase.event_id.in_(managed)
        if profile:
            cond = or_(cond, SupportCase.event_id.in_(select(Event.id).where(Event.organizer_id == profile.id)))
        stmt = stmt.where(cond)
    if status:
        stmt = stmt.where(SupportCase.status == status)
    items, total = paginate(db, stmt.order_by(SupportCase.updated_at.desc()), page, page_size)
    return {"items": [support_case_out(c) for c in items], "total": total, "page": page, "page_size": page_size}


@router.post("/cases", status_code=201)
def create_case(data: CaseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event_id = data.event_id
    if data.order_id:
        o = db.get(Order, data.order_id)
        if not o or o.user_id != user.id:
            raise bad_request("Order not found in your account")
        event_id = event_id or o.event_id
    if event_id and not db.get(Event, event_id):
        raise bad_request("Event not found")
    c = SupportCase(user_id=user.id, event_id=event_id, order_id=data.order_id, category=data.category, subject=data.subject.strip())
    db.add(c)
    db.flush()
    db.add(SupportMessage(case_id=c.id, author_id=user.id, body=data.message.strip(), is_staff=False))
    audit(db, user, "support.case_created", "support_case", c.id, event_id, category=data.category.value)
    db.commit()
    db.refresh(c)
    return support_case_out(c, messages=True)


@router.get("/cases/{case_id}")
def get_case(case_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c, staff = _load(db, user, case_id)
    return support_case_out(c, messages=True) | {"can_reply_as_staff": staff}


@router.post("/cases/{case_id}/messages", status_code=201)
def post_message(case_id: int, data: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c, staff = _load(db, user, case_id)
    as_staff = staff and c.user_id != user.id
    db.add(SupportMessage(case_id=c.id, author_id=user.id, body=data.body.strip(), is_staff=as_staff))
    if as_staff:
        if c.status in (SupportStatus.open, SupportStatus.resolved):
            c.status = SupportStatus.in_progress
        notify(db, c.user, "support_reply", f"New reply on: {c.subject}", data.body.strip()[:300], f"/support/{c.id}")
    else:
        if c.status in (SupportStatus.waiting_for_customer, SupportStatus.resolved):
            c.status = SupportStatus.open
    c.updated_at = func.now()  # bump so the case sorts to the top
    db.commit()
    db.refresh(c)
    return support_case_out(c, messages=True) | {"can_reply_as_staff": staff}


@router.patch("/cases/{case_id}/status")
def set_status(case_id: int, data: StatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c, staff = _load(db, user, case_id)
    if not staff:
        # customers may only close (resolve) or reopen their own case
        if data.status not in (SupportStatus.resolved, SupportStatus.open):
            raise bad_request("You can only resolve or reopen your own case")
    old = c.status
    c.status = data.status
    label = data.status.value.replace("_", " ")
    db.add(SupportMessage(case_id=c.id, author_id=user.id, kind="status_change", body=f"Status changed from {old.value.replace('_', ' ')} to {label}",
                          is_staff=staff and c.user_id != user.id))
    if staff and c.user_id != user.id:
        notify(db, c.user, "support_status", f"Support case updated: {c.subject}", f"Your case status is now: {label}.", f"/support/{c.id}")
    audit(db, user, "support.status_changed", "support_case", c.id, c.event_id, old=old.value, new=data.status.value)
    db.commit()
    db.refresh(c)
    return support_case_out(c, messages=True) | {"can_reply_as_staff": staff}
