from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.errors import AppError, bad_request, conflict
from app.core.security import (
    create_access_token,
    create_token,
    decode_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.database.session import get_db
from app.models import User, UserRole
from app.services.audit import audit
from app.services.notifications import notify, queue_email
from app.services.serializers import user_out
from app.services.ticketing import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


def _check_password(v: str) -> str:
    if len(v) < 8 or not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
        raise ValueError("Password must be at least 8 characters and contain letters and digits")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    preferred_language: str = Field(default="ru", pattern="^(ru|kk|en)$")

    _pw = field_validator("password")(_check_password)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenIn(BaseModel):
    token: str


class EmailIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(max_length=128)
    _pw = field_validator("password")(_check_password)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(max_length=128)
    _pw = field_validator("new_password")(_check_password)


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    preferred_language: str | None = Field(default=None, pattern="^(ru|kk|en)$")


def _send_verification(db: Session, user: User) -> None:
    token = create_token(user.id, "verify_email", timedelta(hours=settings.email_token_hours), {"email": user.email})
    link = f"{settings.frontend_url}/verify-email?token={token}"
    queue_email(db, user.email, "BiletFlow: confirm your email",
                f"Hello {user.full_name},\n\nPlease confirm your email address by opening this link:\n{link}\n\n"
                f"The link is valid for {settings.email_token_hours} hours.\n\n— BiletFlow (local demo)")


def _auth_response(user: User) -> dict:
    return {"access_token": create_access_token(user.id, user.token_version), "token_type": "bearer", "user": user_out(user)}


@router.post("/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise conflict("An account with this email already exists", "email_taken")
    user = User(email=email, password_hash=hash_password(data.password), full_name=data.full_name.strip(), phone=data.phone,
                preferred_language=data.preferred_language, role=UserRole.attendee)
    db.add(user)
    db.flush()
    _send_verification(db, user)
    notify(db, user, "registration", "Welcome to BiletFlow",
           "Your account has been created. Please check your inbox to verify your email address.", "/account", email=False)
    audit(db, user, "user.registered", "user", user.id)
    db.commit()
    db.refresh(user)
    return _auth_response(user)


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Incorrect email or password")
    if not user.is_active:
        raise AppError(403, "account_disabled", "This account has been deactivated")
    user.last_login_at = utcnow()
    db.commit()
    return _auth_response(user)


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    # Tokens are stateless; the client discards its token. Use /logout-all to revoke every session.
    return {"message": "Logged out"}


@router.post("/logout-all")
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.token_version += 1
    db.commit()
    return {"message": "All sessions have been signed out"}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    audit(db, user, "user.profile_updated", "user", user.id)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/change-password")
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise bad_request("Current password is incorrect", "invalid_password")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    audit(db, user, "user.password_changed", "user", user.id)
    db.commit()
    return _auth_response(user)


@router.post("/verify-email")
def verify_email(data: TokenIn, db: Session = Depends(get_db)):
    payload = decode_token(data.token, "verify_email")
    user = db.get(User, int(payload["sub"])) if payload else None
    if not user or user.email != payload.get("email"):
        raise bad_request("This verification link is invalid or has expired", "invalid_token")
    if not user.email_verified:
        user.email_verified = True
        notify(db, user, "email_verified", "Email verified", "Your email address has been confirmed. Thank you!", "/account", email=False)
        audit(db, user, "user.email_verified", "user", user.id)
        db.commit()
    return {"message": "Email verified", "user": user_out(user)}


@router.post("/resend-verification")
def resend_verification(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.email_verified:
        return {"message": "Email is already verified"}
    _send_verification(db, user)
    db.commit()
    return {"message": "Verification email sent"}


@router.post("/forgot-password")
def forgot_password(data: EmailIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if user and user.is_active:
        token = create_token(user.id, "reset_password", timedelta(minutes=settings.reset_token_minutes),
                             {"fp": password_fingerprint(user.password_hash)})
        link = f"{settings.frontend_url}/reset-password?token={token}"
        queue_email(db, user.email, "BiletFlow: reset your password",
                    f"Hello {user.full_name},\n\nUse this link to choose a new password (valid for {settings.reset_token_minutes} minutes):\n"
                    f"{link}\n\nIf you did not request this, you can ignore this email.\n\n— BiletFlow (local demo)")
        audit(db, user, "user.password_reset_requested", "user", user.id)
        db.commit()
    # Same answer either way so the endpoint cannot be used to discover accounts
    return {"message": "If an account exists for this email, a reset link has been sent"}


@router.post("/reset-password")
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    payload = decode_token(data.token, "reset_password")
    user = db.get(User, int(payload["sub"])) if payload else None
    if not user or payload.get("fp") != password_fingerprint(user.password_hash):
        raise bad_request("This reset link is invalid or has already been used", "invalid_token")
    user.password_hash = hash_password(data.password)
    user.token_version += 1
    audit(db, user, "user.password_reset", "user", user.id)
    db.commit()
    return {"message": "Password updated. You can now log in."}
