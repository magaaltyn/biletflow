-- BiletFlow schema (SRS section 6). Money is integer KZT. Times are timestamptz.

CREATE TABLE users (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  password_hash     text,                         -- NULL for Google-only accounts
  google_id         text UNIQUE,
  full_name         text NOT NULL,
  phone             text,
  role              text NOT NULL DEFAULT 'attendee'
                    CHECK (role IN ('attendee', 'organizer', 'platform_admin')),
  email_verified_at timestamptz,
  suspended_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizer_profiles (
  user_id             bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name        text NOT NULL,
  contact_email       text,
  contact_phone       text,
  bio                 text,
  identity_status     text NOT NULL DEFAULT 'none'
                      CHECK (identity_status IN ('none', 'verified')),   -- simulated KYC
  identity_verified_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout_accounts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bank_name    text NOT NULL,
  holder_name  text NOT NULL,
  iban_last4   text NOT NULL,                     -- only the last 4 digits are stored (demo)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Venues and predefined seating layouts (SRS 4.3.1)
CREATE TABLE venues (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  city          text NOT NULL,
  address       text NOT NULL,
  timezone      text NOT NULL DEFAULT 'Asia/Almaty',
  kind          text NOT NULL DEFAULT 'hall' CHECK (kind IN ('arena', 'stadium', 'theatre', 'hall', 'outdoor')),
  map_image_url text,                             -- picture of the venue / stadium map
  has_seat_map  boolean NOT NULL DEFAULT false,
  map_width     int,
  map_height    int,
  created_by    bigint REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venue_sections (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id       bigint NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  code           text NOT NULL,
  name           text NOT NULL,
  price_category text NOT NULL,                   -- e.g. 'premium', 'standard', 'economy'
  view_image_url text,                            -- "view from this section" picture
  UNIQUE (venue_id, code)
);

CREATE TABLE seats (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id    bigint NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section_id  bigint NOT NULL REFERENCES venue_sections(id) ON DELETE CASCADE,
  row_label   text NOT NULL,
  seat_number int NOT NULL,
  accessible  boolean NOT NULL DEFAULT false,
  x           real NOT NULL,
  y           real NOT NULL,
  UNIQUE (section_id, row_label, seat_number)
);

-- Events (SRS 4.2)
CREATE TABLE events (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id            bigint NOT NULL REFERENCES users(id),
  venue_id                bigint NOT NULL REFERENCES venues(id),
  slug                    text NOT NULL UNIQUE,
  title                   text NOT NULL,
  description             text NOT NULL DEFAULT '',
  category                text NOT NULL DEFAULT 'concert',
  image_url               text,
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  visibility              text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
  private_token           text NOT NULL DEFAULT md5(random()::text),
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  seating                 text NOT NULL DEFAULT 'general' CHECK (seating IN ('general', 'assigned')),
  capacity                int NOT NULL CHECK (capacity > 0),
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  refund_policy           text NOT NULL DEFAULT 'Refunds are possible until 48 hours before the event.',
  paid_sales_status       text NOT NULL DEFAULT 'inactive' CHECK (paid_sales_status IN ('inactive', 'active', 'suspended')),
  suspended_at            timestamptz,
  duplicated_from         bigint REFERENCES events(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX events_public_idx ON events (status, visibility, starts_at);

-- Paid Sales Activation checklist (SRS 3.2, 4.5)
CREATE TABLE event_activations (
  event_id          bigint PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  fee_kzt           int NOT NULL,
  fee_paid_at       timestamptz,
  terms_accepted_at timestamptz,
  activated_at      timestamptz
);

-- Ticket types (SRS 4.3)
CREATE TABLE ticket_types (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price_kzt     int NOT NULL CHECK (price_kzt >= 0),
  quantity      int NOT NULL CHECK (quantity >= 0),
  sold          int NOT NULL DEFAULT 0,
  reserved      int NOT NULL DEFAULT 0,
  sales_start   timestamptz,
  sales_end     timestamptz,
  max_per_order int NOT NULL DEFAULT 10 CHECK (max_per_order > 0),
  hidden        boolean NOT NULL DEFAULT false,
  section_codes text[] NOT NULL DEFAULT '{}',     -- assigned seating: sections priced by this type
  sort_order    int NOT NULL DEFAULT 0,
  CHECK (sold + reserved <= quantity)            -- inventory can never be oversold
);

-- Seat state per event. The primary key makes double-selling a seat impossible.
CREATE TABLE event_seats (
  event_id    bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_id     bigint NOT NULL REFERENCES seats(id),
  status      text NOT NULL CHECK (status IN ('held', 'sold', 'blocked')),
  order_id    bigint,
  held_until  timestamptz,
  PRIMARY KEY (event_id, seat_id)
);

-- Promotional campaigns with a promo code and a Campaign QR token (SRS 4.14)
CREATE TABLE campaigns (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id         bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             text NOT NULL,
  code             text NOT NULL,
  token            text NOT NULL UNIQUE,         -- opaque token used in the Campaign QR link
  discount_type    text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value   int NOT NULL CHECK (discount_value > 0),
  valid_from       timestamptz,
  valid_until      timestamptz,
  max_redemptions  int,
  redemptions      int NOT NULL DEFAULT 0,
  ticket_type_ids  bigint[] NOT NULL DEFAULT '{}', -- empty = all ticket types
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (max_redemptions IS NULL OR redemptions <= max_redemptions)
);

-- Orders (SRS 4.4, 4.6, 4.9)
CREATE TABLE orders (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  event_id         bigint NOT NULL REFERENCES events(id),
  user_id          bigint NOT NULL REFERENCES users(id),
  status           text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  subtotal_kzt     int NOT NULL,
  discount_kzt     int NOT NULL DEFAULT 0,
  fee_kzt          int NOT NULL DEFAULT 0,
  total_kzt        int NOT NULL,
  campaign_id      bigint REFERENCES campaigns(id),
  attendee_name    text NOT NULL,
  attendee_email   text NOT NULL,
  payment_provider text NOT NULL DEFAULT 'none' CHECK (payment_provider IN ('none', 'demo', 'halyk')),
  reserved_until   timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_event_idx ON orders (event_id, created_at);
CREATE INDEX orders_pending_idx ON orders (reserved_until) WHERE status = 'pending';

CREATE TABLE order_items (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id       bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id bigint NOT NULL REFERENCES ticket_types(id),
  seat_id        bigint REFERENCES seats(id),
  section_code   text,
  row_label      text,
  seat_number    int,
  unit_price_kzt int NOT NULL,
  discount_kzt   int NOT NULL DEFAULT 0
);

-- One free ticket per account per event: a row exists while the free ticket is active.
CREATE TABLE free_ticket_claims (
  event_id bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  bigint NOT NULL REFERENCES users(id),
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

-- Tickets (SRS 4.7)
CREATE TABLE tickets (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           text NOT NULL UNIQUE,             -- e.g. BF-84215-0015
  order_id       bigint NOT NULL REFERENCES orders(id),
  order_item_id  bigint NOT NULL UNIQUE REFERENCES order_items(id),
  event_id       bigint NOT NULL REFERENCES events(id),
  ticket_type_id bigint NOT NULL REFERENCES ticket_types(id),
  user_id        bigint NOT NULL REFERENCES users(id),
  attendee_name  text NOT NULL,
  section_code   text,
  row_label      text,
  seat_number    int,
  status         text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'checked_in', 'cancelled', 'refunded')),
  checked_in_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_event_idx ON tickets (event_id, status);

CREATE TABLE payments (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purpose      text NOT NULL CHECK (purpose IN ('ticket_order', 'activation_fee')),
  order_id     bigint REFERENCES orders(id),
  event_id     bigint NOT NULL REFERENCES events(id),
  user_id      bigint NOT NULL REFERENCES users(id),
  provider     text NOT NULL CHECK (provider IN ('demo', 'halyk')),
  provider_ref text NOT NULL UNIQUE,               -- invoice id sent to the provider
  amount_kzt   int NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  details      jsonb NOT NULL DEFAULT '{}',
  is_demo      boolean NOT NULL DEFAULT true,       -- SRS 4.6: never presented as real money
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE refunds (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint NOT NULL UNIQUE REFERENCES orders(id),
  amount_kzt  int NOT NULL,
  reason      text NOT NULL,
  created_by  bigint NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Event Admins (check-in staff) assigned by organizers
CREATE TABLE staff_assignments (
  event_id   bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    bigint NOT NULL REFERENCES users(id),
  can_undo   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE check_ins (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id  bigint NOT NULL REFERENCES tickets(id),
  event_id   bigint NOT NULL REFERENCES events(id),
  staff_id   bigint NOT NULL REFERENCES users(id),
  action     text NOT NULL CHECK (action IN ('check_in', 'undo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promo_redemptions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id  bigint NOT NULL REFERENCES campaigns(id),
  order_id     bigint NOT NULL UNIQUE REFERENCES orders(id),
  discount_kzt int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_visits (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Notifications (SRS 4.10)
CREATE TABLE notifications (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Support cases (SRS 4.13)
CREATE TABLE support_cases (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         text NOT NULL UNIQUE,
  kind         text NOT NULL CHECK (kind IN ('attendee', 'organizer')),
  requester_id bigint NOT NULL REFERENCES users(id),
  category     text NOT NULL CHECK (category IN ('ticket_delivery', 'payment', 'refund', 'seating', 'event_info', 'check_in', 'account', 'activation', 'technical')),
  subject      text NOT NULL,
  event_id     bigint REFERENCES events(id),
  order_id     bigint REFERENCES orders(id),
  ticket_id    bigint REFERENCES tickets(id),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_for_customer', 'resolved')),
  assignee_id  bigint REFERENCES users(id),
  escalated    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    bigint NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_id  bigint NOT NULL REFERENCES users(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log / event activity timeline (SRS 4.16). Append-only.
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    bigint REFERENCES events(id),
  actor_id    bigint REFERENCES users(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   bigint,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_idx ON audit_log (event_id, created_at DESC);

CREATE FUNCTION audit_log_readonly() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();

CREATE TABLE event_reports (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_id bigint NOT NULL REFERENCES users(id),
  reason      text NOT NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO platform_settings (key, value) VALUES
  ('activation_fee_kzt', '5000'),
  ('processing_fee_percent', '3');

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
