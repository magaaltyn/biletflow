"""SQLAlchemy ORM models for BiletFlow.

Money is stored as NUMERIC(12, 2) in KZT. All timestamps are timezone-aware (stored as UTC).
"""
from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base

Money = Numeric(12, 2)


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x], native_enum=False, length=32)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ---------------------------------------------------------------- enums
class UserRole(str, enum.Enum):
    attendee = "attendee"
    organizer = "organizer"
    event_admin = "event_admin"
    platform_admin = "platform_admin"


class VerificationStatus(str, enum.Enum):
    unverified = "unverified"
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class PaidSalesStatus(str, enum.Enum):
    not_started = "not_started"
    pending_review = "pending_review"
    active = "active"
    rejected = "rejected"


class EventStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    cancelled = "cancelled"
    suspended = "suspended"


class EventVisibility(str, enum.Enum):
    public = "public"
    unlisted = "unlisted"
    private = "private"


class TicketTypeVisibility(str, enum.Enum):
    visible = "visible"
    hidden = "hidden"


class OrderStatus(str, enum.Enum):
    pending = "pending"  # awaiting demo payment, inventory reserved
    completed = "completed"  # paid / registered, tickets issued
    cancelled = "cancelled"
    expired = "expired"
    refunded = "refunded"
    partially_refunded = "partially_refunded"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


class TicketStatus(str, enum.Enum):
    valid = "valid"
    checked_in = "checked_in"
    cancelled = "cancelled"
    refunded = "refunded"


class RefundStatus(str, enum.Enum):
    requested = "requested"
    completed = "completed"
    rejected = "rejected"


class DiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class RedemptionStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    released = "released"


class SupportStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting_for_customer = "waiting_for_customer"
    resolved = "resolved"


class SupportCategory(str, enum.Enum):
    tickets = "tickets"
    payment = "payment"
    refund = "refund"
    event = "event"
    account = "account"
    organizer = "organizer"
    other = "other"


class StaffRole(str, enum.Enum):
    event_admin = "event_admin"
    checkin = "checkin"


class CheckInAction(str, enum.Enum):
    check_in = "check_in"
    reversal = "reversal"
    rejected = "rejected"


# ---------------------------------------------------------------- users & organizers
class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40))
    role: Mapped[UserRole] = mapped_column(_enum(UserRole, "user_role"), default=UserRole.attendee, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    preferred_language: Mapped[str] = mapped_column(String(5), default="ru")
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organizer_profile: Mapped[OrganizerProfile | None] = relationship(back_populates="user", uselist=False)


class OrganizerProfile(TimestampMixin, Base):
    __tablename__ = "organizer_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    verification_status: Mapped[VerificationStatus] = mapped_column(
        _enum(VerificationStatus, "verification_status"), default=VerificationStatus.unverified
    )
    # Simulated payout account (demo only — never real banking data)
    payout_bank_name: Mapped[str | None] = mapped_column(String(120))
    payout_account_holder: Mapped[str | None] = mapped_column(String(160))
    payout_account_masked: Mapped[str | None] = mapped_column(String(40))
    activation_fee_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    activation_fee_reference: Mapped[str | None] = mapped_column(String(40))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_sales_status: Mapped[PaidSalesStatus] = mapped_column(
        _enum(PaidSalesStatus, "paid_sales_status"), default=PaidSalesStatus.not_started
    )
    activation_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activation_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activation_review_note: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="organizer_profile")
    events: Mapped[list[Event]] = relationship(back_populates="organizer")


class Venue(TimestampMixin, Base):
    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(primary_key=True)
    organizer_id: Mapped[int | None] = mapped_column(ForeignKey("organizer_profiles.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str] = mapped_column(String(80), index=True)
    capacity: Mapped[int | None] = mapped_column(Integer)


# ---------------------------------------------------------------- events & ticket types
class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_event_capacity_positive"),
        CheckConstraint("ends_at > starts_at", name="ck_event_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("organizer_profiles.id", ondelete="RESTRICT"), index=True)
    venue_id: Mapped[int | None] = mapped_column(ForeignKey("venues.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), index=True)
    image_url: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str] = mapped_column(String(80), index=True)
    venue_name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Almaty")
    capacity: Mapped[int] = mapped_column(Integer)
    registration_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visibility: Mapped[EventVisibility] = mapped_column(_enum(EventVisibility, "event_visibility"), default=EventVisibility.public)
    status: Mapped[EventStatus] = mapped_column(_enum(EventStatus, "event_status"), default=EventStatus.draft, index=True)
    access_key: Mapped[str] = mapped_column(String(40))  # share key for unlisted / private events
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    suspended_reason: Mapped[str | None] = mapped_column(Text)
    status_before_suspension: Mapped[str | None] = mapped_column(String(32))
    duplicated_from_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))

    organizer: Mapped[OrganizerProfile] = relationship(back_populates="events")
    venue: Mapped[Venue | None] = relationship()
    ticket_types: Mapped[list[TicketType]] = relationship(
        back_populates="event", order_by="TicketType.sort_order, TicketType.id", cascade="all, delete-orphan"
    )


class TicketType(TimestampMixin, Base):
    __tablename__ = "ticket_types"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_tt_price"),
        CheckConstraint("quantity_total >= 0", name="ck_tt_qty"),
        CheckConstraint("quantity_sold >= 0 AND quantity_reserved >= 0", name="ck_tt_counters"),
        CheckConstraint("quantity_sold + quantity_reserved <= quantity_total", name="ck_tt_no_oversell"),
        CheckConstraint("max_per_order >= 1", name="ck_tt_max_per_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    quantity_total: Mapped[int] = mapped_column(Integer)
    quantity_sold: Mapped[int] = mapped_column(Integer, default=0)
    quantity_reserved: Mapped[int] = mapped_column(Integer, default=0)
    sales_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sales_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_per_order: Mapped[int] = mapped_column(Integer, default=10)
    visibility: Mapped[TicketTypeVisibility] = mapped_column(
        _enum(TicketTypeVisibility, "ticket_type_visibility"), default=TicketTypeVisibility.visible
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    event: Mapped[Event] = relationship(back_populates="ticket_types")

    @property
    def is_free(self) -> bool:
        return Decimal(self.price) == 0

    @property
    def quantity_available(self) -> int:
        return max(0, self.quantity_total - self.quantity_sold - self.quantity_reserved)


class StaffAssignment(Base):
    __tablename__ = "staff_assignments"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_staff_event_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[StaffRole] = mapped_column(_enum(StaffRole, "staff_role"), default=StaffRole.event_admin)
    assigned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    event: Mapped[Event] = relationship()


# ---------------------------------------------------------------- campaigns & promo codes
promo_code_ticket_types = Table(
    "promo_code_ticket_types",
    Base.metadata,
    Column("promo_code_id", ForeignKey("promo_codes.id", ondelete="CASCADE"), primary_key=True),
    Column("ticket_type_id", ForeignKey("ticket_types.id", ondelete="CASCADE"), primary_key=True),
)


class Campaign(TimestampMixin, Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visits: Mapped[int] = mapped_column(Integer, default=0)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    event: Mapped[Event] = relationship()
    promo_codes: Mapped[list[PromoCode]] = relationship(back_populates="campaign", cascade="all, delete-orphan")


class PromoCode(TimestampMixin, Base):
    __tablename__ = "promo_codes"
    __table_args__ = (
        UniqueConstraint("event_id", "code", name="uq_promo_event_code"),
        CheckConstraint("discount_value > 0", name="ck_promo_value"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    discount_type: Mapped[DiscountType] = mapped_column(_enum(DiscountType, "discount_type"))
    discount_value: Mapped[Decimal] = mapped_column(Money)
    max_redemptions: Mapped[int | None] = mapped_column(Integer)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    campaign: Mapped[Campaign] = relationship(back_populates="promo_codes")
    ticket_types: Mapped[list[TicketType]] = relationship(secondary=promo_code_ticket_types)


# ---------------------------------------------------------------- orders, payments, tickets
class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("total >= 0 AND subtotal >= 0 AND discount_total >= 0", name="ck_order_amounts"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus, "order_status"), default=OrderStatus.pending, index=True)
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    discount_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    refunded_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    is_free: Mapped[bool] = mapped_column(Boolean, default=False)
    promo_code_id: Mapped[int | None] = mapped_column(ForeignKey("promo_codes.id", ondelete="SET NULL"))
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id", ondelete="SET NULL"))
    buyer_name: Mapped[str] = mapped_column(String(160))
    buyer_email: Mapped[str] = mapped_column(String(255))
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()
    event: Mapped[Event] = relationship()
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")
    attendees: Mapped[list[Attendee]] = relationship(back_populates="order", cascade="all, delete-orphan")
    tickets: Mapped[list[Ticket]] = relationship(back_populates="order")
    payments: Mapped[list[Payment]] = relationship(back_populates="order", order_by="Payment.id")
    refunds: Mapped[list[Refund]] = relationship(back_populates="order", order_by="Refund.id")
    promo_code: Mapped[PromoCode | None] = relationship()


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_item_qty"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    ticket_type_id: Mapped[int] = mapped_column(ForeignKey("ticket_types.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Money)

    order: Mapped[Order] = relationship(back_populates="items")
    ticket_type: Mapped[TicketType] = relationship()


class Attendee(Base):
    __tablename__ = "attendees"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="attendees")


class Ticket(TimestampMixin, Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    qr_nonce: Mapped[str] = mapped_column(String(64))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"))
    ticket_type_id: Mapped[int] = mapped_column(ForeignKey("ticket_types.id", ondelete="RESTRICT"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    attendee_id: Mapped[int] = mapped_column(ForeignKey("attendees.id", ondelete="RESTRICT"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[TicketStatus] = mapped_column(_enum(TicketStatus, "ticket_status"), default=TicketStatus.valid, index=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="tickets")
    ticket_type: Mapped[TicketType] = relationship()
    event: Mapped[Event] = relationship()
    attendee: Mapped[Attendee] = relationship()


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        # At most one successful payment per order (defence against duplicate confirmation)
        Index("uq_payment_success_per_order", "order_id", unique=True,
              postgresql_where=text("status = 'succeeded' AND purpose = 'order'")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    organizer_id: Mapped[int | None] = mapped_column(ForeignKey("organizer_profiles.id", ondelete="SET NULL"))
    purpose: Mapped[str] = mapped_column(String(32), default="order")  # order | activation_fee
    provider: Mapped[str] = mapped_column(String(32), default="demo")
    method: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus, "payment_status"), default=PaymentStatus.pending)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order | None] = relationship(back_populates="payments")


class Refund(Base):
    __tablename__ = "refunds"
    __table_args__ = (CheckConstraint("amount >= 0", name="ck_refund_amount"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[RefundStatus] = mapped_column(_enum(RefundStatus, "refund_status"), default=RefundStatus.requested)
    ticket_ids: Mapped[list | None] = mapped_column(JSON)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    processed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reference: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="refunds")


class PromoRedemption(Base):
    __tablename__ = "promo_redemptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    promo_code_id: Mapped[int] = mapped_column(ForeignKey("promo_codes.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    discount_amount: Mapped[Decimal] = mapped_column(Money)
    status: Mapped[RedemptionStatus] = mapped_column(_enum(RedemptionStatus, "redemption_status"), default=RedemptionStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CheckInRecord(Base):
    __tablename__ = "checkin_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    scanned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[CheckInAction] = mapped_column(_enum(CheckInAction, "checkin_action"))
    reason: Mapped[str | None] = mapped_column(String(255))
    device: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


# ---------------------------------------------------------------- support, notifications, audit
class SupportCase(TimestampMixin, Base):
    __tablename__ = "support_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    category: Mapped[SupportCategory] = mapped_column(_enum(SupportCategory, "support_category"))
    subject: Mapped[str] = mapped_column(String(200))
    status: Mapped[SupportStatus] = mapped_column(_enum(SupportStatus, "support_status"), default=SupportStatus.open, index=True)

    user: Mapped[User] = relationship()
    event: Mapped[Event | None] = relationship()
    messages: Mapped[list[SupportMessage]] = relationship(back_populates="case", order_by="SupportMessage.id", cascade="all, delete-orphan")


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("support_cases.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20), default="message")  # message | status_change
    body: Mapped[str] = mapped_column(Text)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped[SupportCase] = relationship(back_populates="messages")
    author: Mapped[User | None] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), index=True)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    actor: Mapped[User | None] = relationship()
