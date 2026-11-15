from datetime import timedelta

from app.core.security import create_token, password_fingerprint
from app.models import User
from tests.conftest import PASSWORD, auth_header, make_admin, make_organizer, register


def test_register_success(client):
    r = client.post("/api/v1/auth/register", json={"email": "Aigerim@Test.kz", "password": PASSWORD, "full_name": "Aigerim"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "aigerim@test.kz"
    assert body["user"]["role"] == "attendee"
    assert body["user"]["email_verified"] is False
    assert body["access_token"]


def test_duplicate_email_rejected(client):
    register(client, "dup@test.kz")
    r = client.post("/api/v1/auth/register", json={"email": "DUP@test.kz", "password": PASSWORD, "full_name": "Again"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_taken"


def test_weak_password_rejected(client):
    r = client.post("/api/v1/auth/register", json={"email": "weak@test.kz", "password": "short", "full_name": "Weak"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_password_is_hashed(client, db):
    register(client, "hash@test.kz")
    u = db.query(User).filter_by(email="hash@test.kz").one()
    assert u.password_hash != PASSWORD and u.password_hash.startswith("$2")


def test_login_success_and_failure(client):
    register(client, "login@test.kz")
    ok = client.post("/api/v1/auth/login", json={"email": "login@test.kz", "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["access_token"]
    bad = client.post("/api/v1/auth/login", json={"email": "login@test.kz", "password": "WrongPass1"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    missing = client.post("/api/v1/auth/login", json={"email": "nobody@test.kz", "password": PASSWORD})
    assert missing.status_code == 401


def test_protected_endpoints_require_auth(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/orders").status_code == 401
    assert client.get("/api/v1/auth/me", headers=auth_header("garbage")).status_code == 401


def test_profile_update(client):
    u = register(client, "prof@test.kz")
    r = client.patch("/api/v1/users/me", json={"full_name": "New Name", "preferred_language": "kk"}, headers=u["h"])
    assert r.status_code == 200 and r.json()["full_name"] == "New Name" and r.json()["preferred_language"] == "kk"


def test_email_verification(client, db):
    u = register(client, "verify@test.kz")
    token = create_token(u["user"]["id"], "verify_email", timedelta(hours=1), {"email": "verify@test.kz"})
    assert client.post("/api/v1/auth/verify-email", json={"token": "bad"}).status_code == 400
    r = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert r.status_code == 200 and r.json()["user"]["email_verified"] is True


def test_password_reset_single_use(client, db):
    u = register(client, "reset@test.kz")
    assert client.post("/api/v1/auth/forgot-password", json={"email": "reset@test.kz"}).status_code == 200
    user = db.get(User, u["user"]["id"])
    token = create_token(user.id, "reset_password", timedelta(minutes=10), {"fp": password_fingerprint(user.password_hash)})
    r = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "NewPassw0rd"})
    assert r.status_code == 200
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "Another1pass"}).status_code == 400
    assert client.post("/api/v1/auth/login", json={"email": "reset@test.kz", "password": "NewPassw0rd"}).status_code == 200
    # the old access token was revoked by the token_version bump
    assert client.get("/api/v1/auth/me", headers=u["h"]).status_code == 401


def test_role_permissions(client, db):
    attendee = register(client, "att@test.kz")
    org = make_organizer(client, db)
    admin = make_admin(client, db)
    assert client.get("/api/v1/admin/stats", headers=attendee["h"]).status_code == 403
    assert client.get("/api/v1/admin/stats", headers=org["h"]).status_code == 403
    assert client.get("/api/v1/admin/stats", headers=admin["h"]).status_code == 200
    assert client.get("/api/v1/admin/users", headers=org["h"]).status_code == 403
    assert client.get("/api/v1/organizers/me", headers=attendee["h"]).status_code == 403
    me = client.get("/api/v1/auth/me", headers=org["h"]).json()
    assert me["role"] == "organizer"


def test_deactivated_user_cannot_use_token(client, db):
    u = register(client, "deact@test.kz")
    admin = make_admin(client, db)
    r = client.patch(f"/api/v1/admin/users/{u['user']['id']}", json={"is_active": False}, headers=admin["h"])
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me", headers=u["h"]).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "deact@test.kz", "password": PASSWORD}).status_code == 403
