"""Platform administration (Platform Admin role only)."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.errors import bad_request, conflict, not_found
from app.database.session import get_db
from app.models import (
    AuditLog,
    Event,
    EventStatus,
    Order,
    OrderStatus,
    OrganizerProfile,
    PaidSalesStatus,
    Payment,
    PaymentStatus,
    Refund,
    RefundStatus,
    SupportCase,
    SupportStatus,
    Ticket,
    TicketStatus,
    User,
    UserRole,
    VerificationStatus,
)
from app.services.audit import audit
from app.services.notifications import notify
from app.services.serializers import event_out, iso, order_out, organizer_out, paginate, refund_out, user_out
from app.services.ticketing import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


class UserPatch(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


class ReviewIn(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)


class VerificationIn(BaseModel):
    status: VerificationStatus


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


def _page(items, total, page, page_size, fn):
    return {"items": [fn(i) for i in items], "total": total, "page": page, "page_size": page_size}


@router.get("/stats")
def stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    paid = (OrderStatus.completed, OrderStatus.refunded, OrderStatus.partially_refunded)
    gross, discounts = db.execute(select(func.coalesce(func.sum(Order.subtotal), 0), func.coalesce(func.sum(Order.discount_total), 0))
                                  .where(Order.status.in_(paid))).one()
    refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.status == RefundStatus.completed))
    users_by_role = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    events_by_status = dict(db.execute(select(Event.status, func.count()).group_by(Event.status)).all())
    tickets_by_status = dict(db.execute(select(Ticket.status, func.count()).group_by(Ticket.status)).all())
    return {
        "users": sum(users_by_role.values()),
        "users_by_role": {r.value: users_by_role.get(r, 0) for r in UserRole},
        "organizers": db.scalar(select(func.count()).select_from(OrganizerProfile)),
        "events_by_status": {s.value: events_by_status.get(s, 0) for s in EventStatus},
        "orders_completed": db.scalar(select(func.count()).select_from(Order).where(Order.status.in_(paid))),
        "tickets_by_status": {s.value: tickets_by_status.get(s, 0) for s in TicketStatus},
        "gross_sales": float(gross), "discounts": float(discounts), "refunds": float(refunds),
        "net_revenue": float(gross - discounts - refunds),
        "payments_failed": db.scalar(select(func.count()).select_from(Payment).where(Payment.status == PaymentStatus.failed)),
        "pending_activations": db.scalar(select(func.count()).select_from(OrganizerProfile).where(OrganizerProfile.paid_sales_status == PaidSalesStatus.pending_review)),
        "pending_refunds": db.scalar(select(func.count()).select_from(Refund).where(Refund.status == RefundStatus.requested)),
        "open_support_cases": db.scalar(select(func.count()).select_from(SupportCase).where(SupportCase.status != SupportStatus.resolved)),
        "currency": "KZT",
    }


# ------------------------------------------------------------------ users
@router.get("/users")
def users(q: str | None = None, role: UserRole | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
          admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(User)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    if role:
        stmt = stmt.where(User.role == role)
    items, total = paginate(db, stmt.order_by(User.id.desc()), page, page_size)
    return _page(items, total, page, page_size, user_out)


@router.patch("/users/{user_id}")
def update_user(user_id: int, data: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise not_found("User not found")
    if u.id == admin.id and (data.is_active is False or (data.role and data.role != UserRole.platform_admin)):
        raise bad_request("You cannot deactivate or demote your own admin account")
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(u, k, v)
    if data.is_active is False:
        u.token_version += 1
    audit(db, admin, "admin.user_updated", "user", u.id, **{k: getattr(v, "value", v) for k, v in changes.items()})
    db.commit()
    return user_out(u)


# ------------------------------------------------------------------ organizers & paid-sales activation
@router.get("/organizers")
def organizers(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(OrganizerProfile)
    if status:
        stmt = stmt.where(OrganizerProfile.paid_sales_status == status)
    items, total = paginate(db, stmt.order_by(OrganizerProfile.activation_submitted_at.desc().nullslast(), OrganizerProfile.id.desc()),
                            page, page_size)
    return _page(items, total, page, page_size, lambda p: organizer_out(p, private=True) | {
        "owner": {"id": p.user.id, "email": p.user.email, "full_name": p.user.full_name, "email_verified": p.user.email_verified},
        "event_count": len(p.events)})


@router.post("/organizers/{organizer_id}/activation")
def review_activation(organizer_id: int, data: ReviewIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(OrganizerProfile, organizer_id)
    if not p:
        raise not_found("Organizer not found")
    if p.paid_sales_status != PaidSalesStatus.pending_review:
        raise conflict("This organizer has no pending activation request")
    p.paid_sales_status = PaidSalesStatus.active if data.approve else PaidSalesStatus.rejected
    p.verification_status = VerificationStatus.verified if data.approve else VerificationStatus.rejected
    p.activation_reviewed_at = utcnow()
    p.activation_review_note = data.note
    notify(db, p.user, "activation_review", "Paid sales activated" if data.approve else "Paid-sales activation declined",
           "You can now sell paid tickets (DEMO payments)." if data.approve else f"Your activation request was declined. {data.note or ''}",
           "/organizer?tab=Settings")
    audit(db, admin, "admin.activation_approved" if data.approve else "admin.activation_rejected", "organizer", p.id, note=data.note)
    db.commit()
    return organizer_out(p, private=True)


@router.post("/organizers/{organizer_id}/verification")
def set_verification(organizer_id: int, data: VerificationIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(OrganizerProfile, organizer_id)
    if not p:
        raise not_found("Organizer not found")
    p.verification_status = data.status
    audit(db, admin, "admin.organizer_verification", "organizer", p.id, status=data.status.value)
    db.commit()
    return organizer_out(p, private=True)


# ------------------------------------------------------------------ events & moderation
@router.get("/events")
def events(q: str | None = None, status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Event)
    if q:
        stmt = stmt.where(or_(Event.title.ilike(f"%{q}%"), Event.city.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Event.status == status)
    items, total = paginate(db, stmt.order_by(Event.id.desc()), page, page_size)
    return _page(items, total, page, page_size, lambda e: event_out(e, manage=True, include_tickets=False))


@router.post("/events/{event_id}/suspend")
def suspend(event_id: int, data: ReasonIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    e = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if not e:
        raise not_found("Event not found")
    if e.status in (EventStatus.suspended, EventStatus.cancelled):
        raise conflict(f"Event is already {e.status.value}")
    e.status_before_suspension = e.status.value
    e.status = EventStatus.suspended
    e.suspended_reason = data.reason
    notify(db, e.organizer.user, "event_suspended", f"Event suspended: {e.title}",
           f"Your event was suspended by platform administrators. Reason: {data.reason}", f"/organizer/events/{e.id}")
    audit(db, admin, "admin.event_suspended", "event", e.id, e.id, reason=data.reason)
    db.commit()
    return event_out(e, manage=True)


@router.post("/events/{event_id}/unsuspend")
def unsuspend(event_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    e = db.get(Event, event_id)
    if not e:
        raise not_found("Event not found")
    if e.status != EventStatus.suspended:
        raise conflict("Event is not suspended")
    e.status = EventStatus(e.status_before_suspension or "draft")
    e.suspended_reason = None
    audit(db, admin, "admin.event_unsuspended", "event", e.id, e.id, restored_status=e.status.value)
    db.commit()
    return event_out(e, manage=True)


# ------------------------------------------------------------------ orders, payments, refunds
@router.get("/orders")
def orders(q: str | None = None, status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
           admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Order)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Order.code.ilike(like), Order.buyer_email.ilike(like), Order.buyer_name.ilike(like)))
    if status:
        stmt = stmt.where(Order.status == status)
    items, total = paginate(db, stmt.order_by(Order.id.desc()), page, page_size)
    return _page(items, total, page, page_size, order_out)


@router.get("/payments")
def payments(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
             admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Payment)
    if status:
        stmt = stmt.where(Payment.status == status)
    items, total = paginate(db, stmt.order_by(Payment.id.desc()), page, page_size)
    return _page(items, total, page, page_size, lambda p: {
        "id": p.id, "purpose": p.purpose, "order_id": p.order_id, "order_code": p.order.code if p.order else None,
        "organizer_id": p.organizer_id, "method": p.method, "amount": float(p.amount), "status": p.status.value,
        "reference": p.reference, "failure_reason": p.failure_reason, "is_demo": p.is_demo, "created_at": iso(p.created_at)})


@router.get("/refunds")
def refunds(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
            admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Refund)
    if status:
        stmt = stmt.where(Refund.status == status)
    items, total = paginate(db, stmt.order_by(Refund.id.desc()), page, page_size)
    return _page(items, total, page, page_size, lambda r: refund_out(r) | {"event_title": r.order.event.title, "buyer_email": r.order.buyer_email})


# ------------------------------------------------------------------ audit log
@router.get("/audit-logs")
def audit_logs(action: str | None = None, event_id: int | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if event_id:
        stmt = stmt.where(AuditLog.event_id == event_id)
    items, total = paginate(db, stmt.order_by(AuditLog.id.desc()), page, page_size)
    return _page(items, total, page, page_size, lambda a: {
        "id": a.id, "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "event_id": a.event_id,
        "details": a.details, "created_at": iso(a.created_at),
        "actor": {"id": a.actor.id, "email": a.actor.email, "full_name": a.actor.full_name} if a.actor else None})
