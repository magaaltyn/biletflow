from sqlalchemy.orm import Session

from app.models import AuditLog, User


def audit(db: Session, actor: User | None, action: str, entity_type: str, entity_id: int | None = None,
          event_id: int | None = None, **details) -> AuditLog:
    entry = AuditLog(actor_id=actor.id if actor else None, action=action, entity_type=entity_type,
                     entity_id=entity_id, event_id=event_id, details=details or None)
    db.add(entry)
    return entry
