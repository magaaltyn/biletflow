from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, forbidden
from app.core.security import decode_token
from app.database.session import get_db
from app.models import Event, OrganizerProfile, StaffAssignment, StaffRole, User, UserRole


def _user_from_header(authorization: str | None, db: Session) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    data = decode_token(authorization.split(" ", 1)[1].strip(), "access")
    if not data:
        raise AppError(401, "invalid_token", "Your session has expired. Please log in again.")
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active or user.token_version != data.get("tv"):
        raise AppError(401, "invalid_token", "Your session is no longer valid. Please log in again.")
    return user


def get_current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    user = _user_from_header(authorization, db)
    if not user:
        raise AppError(401, "unauthorized", "Authentication required")
    return user


def get_optional_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User | None:
    try:
        return _user_from_header(authorization, db)
    except AppError:
        return None


def require_roles(*roles: UserRole):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return dep


require_admin = require_roles(UserRole.platform_admin)


def is_admin(user: User | None) -> bool:
    return bool(user and user.role == UserRole.platform_admin)


def get_organizer_profile(db: Session, user: User) -> OrganizerProfile | None:
    return db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))


def require_organizer_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> OrganizerProfile:
    profile = get_organizer_profile(db, user)
    if not profile:
        raise AppError(403, "organizer_profile_required", "Create an organizer profile first")
    return profile


def staff_role_for(db: Session, user: User, event_id: int) -> StaffRole | None:
    return db.scalar(select(StaffAssignment.role).where(StaffAssignment.event_id == event_id, StaffAssignment.user_id == user.id))


def is_event_owner(db: Session, user: User, event: Event) -> bool:
    profile = get_organizer_profile(db, user)
    return bool(profile and profile.id == event.organizer_id)


def can_manage_event(db: Session, user: User | None, event: Event) -> bool:
    """Organizer owner, platform admin, or an assigned Event Admin."""
    if not user:
        return False
    if is_admin(user) or is_event_owner(db, user, event):
        return True
    return staff_role_for(db, user, event.id) == StaffRole.event_admin


def can_checkin(db: Session, user: User | None, event: Event) -> bool:
    if not user:
        return False
    return can_manage_event(db, user, event) or staff_role_for(db, user, event.id) is not None


def ensure_can_manage(db: Session, user: User, event: Event) -> None:
    if not can_manage_event(db, user, event):
        raise forbidden("You are not allowed to manage this event")


def ensure_owner_or_admin(db: Session, user: User, event: Event) -> None:
    if not (is_admin(user) or is_event_owner(db, user, event)):
        raise forbidden("Only the event organizer can perform this action")
