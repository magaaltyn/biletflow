import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode())
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(subject: str | int, purpose: str, expires: timedelta, extra: dict | None = None) -> str:
    payload = {"sub": str(subject), "purpose": purpose, "iat": _now(), "exp": _now() + expires}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, purpose: str) -> dict | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if data.get("purpose") != purpose:
        return None
    return data


def create_access_token(user_id: int, token_version: int) -> str:
    return create_token(user_id, "access", timedelta(minutes=settings.access_token_minutes), {"tv": token_version})


def password_fingerprint(password_hash: str) -> str:
    """Short fingerprint so password-reset links become invalid after the password changes."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


# ---- QR tickets -------------------------------------------------------------
TICKET_QR_PREFIX = "BFT1"


def new_qr_nonce() -> str:
    return secrets.token_urlsafe(18)


def sign_ticket(ticket_code: str, nonce: str) -> str:
    mac = hmac.new(settings.qr_signing_key.encode(), f"{ticket_code}.{nonce}".encode(), hashlib.sha256)
    return mac.hexdigest()[:32]


def ticket_qr_payload(ticket_code: str, nonce: str) -> str:
    return f"{TICKET_QR_PREFIX}.{ticket_code}.{nonce}.{sign_ticket(ticket_code, nonce)}"


def parse_ticket_qr(payload: str) -> tuple[str, str] | None:
    """Returns (ticket_code, nonce) if the payload has a valid signature, else None."""
    parts = (payload or "").strip().split(".")
    if len(parts) != 4 or parts[0] != TICKET_QR_PREFIX:
        return None
    _, code, nonce, sig = parts
    if not hmac.compare_digest(sign_ticket(code, nonce), sig):
        return None
    return code, nonce


def random_code(prefix: str, length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return prefix + "".join(secrets.choice(alphabet) for _ in range(length))
