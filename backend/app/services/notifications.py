"""In-app notifications + e-mail delivery.

E-mails are queued on the SQLAlchemy session and only sent after the transaction commits,
so a rolled-back purchase never sends a "ticket issued" mail. Delivery goes to the local
SMTP catcher (Mailpit, http://localhost:8025). If SMTP is unreachable the message is written
as an .eml file to backend/var/mail so nothing is lost during local development.
"""
import logging
import smtplib
import threading
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Notification, User

log = logging.getLogger("biletflow.mail")
_QUEUE_KEY = "pending_emails"


def _deliver(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=4) as s:
            s.send_message(msg)
        log.info("mail sent to %s: %s", to, subject)
    except OSError as exc:
        out = Path(settings.mail_outbox_dir)
        out.mkdir(parents=True, exist_ok=True)
        name = datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".eml"
        (out / name).write_bytes(bytes(msg))
        log.warning("SMTP unavailable (%s); mail saved to %s", exc, out / name)


def queue_email(db: Session, to: str, subject: str, body: str) -> None:
    if not settings.email_enabled:
        return
    db.info.setdefault(_QUEUE_KEY, []).append((to, subject, body))


@event.listens_for(Session, "after_commit")
def _flush_emails(session: Session) -> None:
    pending = session.info.pop(_QUEUE_KEY, [])
    for item in pending:
        threading.Thread(target=_deliver, args=item, daemon=True).start()


@event.listens_for(Session, "after_rollback")
def _drop_emails(session: Session) -> None:
    session.info.pop(_QUEUE_KEY, None)


def notify(db: Session, user: User, type_: str, title: str, body: str, link: str | None = None, email: bool = True) -> Notification:
    n = Notification(user_id=user.id, type=type_, title=title, body=body, link=link, email_sent=email)
    db.add(n)
    if email:
        url = f"\n\nOpen in BiletFlow: {settings.frontend_url}{link}" if link else ""
        queue_email(db, user.email, f"BiletFlow: {title}", f"Hello {user.full_name},\n\n{body}{url}\n\n— BiletFlow (local demo)")
    return n
