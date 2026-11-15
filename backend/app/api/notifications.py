from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.errors import not_found
from app.database.session import get_db
from app.models import Notification, User
from app.services.serializers import iso
from app.services.ticketing import utcnow

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "body": n.body, "link": n.link, "read": n.read_at is not None,
            "email_sent": n.email_sent, "created_at": iso(n.created_at)}


@router.get("")
def list_notifications(limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc()).limit(limit)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    return {"items": [_out(n) for n in items], "unread": unread}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise not_found("Notification not found")
    n.read_at = n.read_at or utcnow()
    db.commit()
    return _out(n)


@router.post("/read-all")
def mark_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=utcnow()))
    db.commit()
    return {"message": "All notifications marked as read"}
