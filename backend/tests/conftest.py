import os

os.environ["ENVIRONMENT"] = "test"
os.environ["EMAIL_ENABLED"] = "false"

from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import BACKEND_DIR, settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, OrganizerProfile, PaidSalesStatus, User, UserRole, VerificationStatus  # noqa: E402

engine = create_engine(settings.test_database_url, future=True)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["database_url"] = settings.test_database_url
    command.upgrade(cfg, "head")  # also verifies that migrations apply cleanly
    yield


@pytest.fixture(autouse=True)
def _clean():
    names = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    s = TestSession()
    yield s
    s.close()


@pytest.fixture
def client():
    def _get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ----------------------------------------------------------------- helpers
PASSWORD = "Passw0rd!"


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register(client, email: str, name: str = "Test User") -> dict:
    r = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "full_name": name})
    assert r.status_code == 201, r.text
    data = r.json()
    return {"token": data["access_token"], "user": data["user"], "h": auth_header(data["access_token"])}


def make_admin(client, db, email="admin@test.kz") -> dict:
    u = User(email=email, password_hash=hash_password(PASSWORD), full_name="Admin", role=UserRole.platform_admin, email_verified=True)
    db.add(u)
    db.commit()
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return {"token": r.json()["access_token"], "h": auth_header(r.json()["access_token"]), "user": r.json()["user"]}


def make_organizer(client, db, email="org@test.kz", paid=True) -> dict:
    o = register(client, email, "Organizer")
    r = client.post("/api/v1/organizers/me", json={"name": "Test Org", "city": "Almaty"}, headers=o["h"])
    assert r.status_code == 201, r.text
    if paid:
        p = db.query(OrganizerProfile).filter_by(id=r.json()["id"]).one()
        p.paid_sales_status = PaidSalesStatus.active
        p.verification_status = VerificationStatus.verified
        db.commit()
    o["profile"] = r.json()
    return o


def future(days=10, hours=0) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days, hours=hours)).isoformat()


def create_event(client, org, ticket_types=None, capacity=100, publish=True, **extra) -> dict:
    body = {
        "title": "Test Concert", "description": "A great test event", "category": "Music", "venue_name": "Almaty Arena",
        "address": "Abaya 1", "city": "Almaty", "starts_at": future(10), "ends_at": future(10, 3), "capacity": capacity,
        "ticket_types": ticket_types if ticket_types is not None else [
            {"name": "Free", "price": 0, "quantity_total": 50},
            {"name": "Standard", "price": 5000, "quantity_total": 40, "max_per_order": 5},
        ],
        **extra,
    }
    r = client.post("/api/v1/events", json=body, headers=org["h"])
    assert r.status_code == 201, r.text
    ev = r.json()
    if publish:
        r = client.post(f"/api/v1/events/{ev['id']}/publish", headers=org["h"])
        assert r.status_code == 200, r.text
        ev = r.json()
    return ev


def tt_id(ev, name):
    return next(t["id"] for t in ev["ticket_types"] if t["name"] == name)


def buy(client, user, ev, name, qty=1, promo=None, outcome="success"):
    r = client.post("/api/v1/orders", json={"event_id": ev["id"], "items": [{"ticket_type_id": tt_id(ev, name), "quantity": qty}],
                                            "buyer_name": "Buyer Name", "buyer_email": "buyer@test.kz", "promo_code": promo}, headers=user["h"])
    if r.status_code != 201 or outcome is None or r.json()["status"] == "completed":
        return r
    return client.post("/api/v1/payments/demo", json={"order_id": r.json()["id"], "outcome": outcome, "method": "kaspi_demo"}, headers=user["h"])
