"""Convenience endpoint groups (/users, /analytics) that map onto the main routers."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import auth, events, organizers
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models import User

router = APIRouter()


@router.get("/users/me", tags=["users"])
def users_me(user: User = Depends(get_current_user)):
    return auth.me(user)


@router.patch("/users/me", tags=["users"])
def users_me_update(data: auth.ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return auth.update_me(data, user, db)


@router.get("/analytics/events/{event_id}", tags=["analytics"])
def analytics_event(event_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return events.analytics(event_id, user, db)


@router.get("/analytics/organizer", tags=["analytics"])
def analytics_organizer(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return organizers.my_analytics(user, db)
