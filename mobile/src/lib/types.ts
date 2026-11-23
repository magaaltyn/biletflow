// Response shapes of the existing Express API (api/src/routes/*). Only fields the app uses are listed.
export type Role = "attendee" | "organizer" | "platform_admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  email_verified: boolean;
  has_password: boolean;
  google_linked: boolean;
  organizer_name: string | null;
  identity_status: string | null;
  is_event_admin: boolean;
}

export interface EventCardData {
  id: number;
  slug: string;
  title: string;
  category: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  seating: "general" | "assigned";
  capacity: number;
  venue_name: string;
  city: string;
  organizer_name: string;
  min_price: number | null;
  sold: number;
}

export interface TicketTypePublic {
  id: number;
  name: string;
  description: string;
  price_kzt: number;
  quantity: number;
  sold: number;
  reserved: number;
  available: number;
  sales_start: string | null;
  sales_end: string | null;
  max_per_order: number;
  section_codes: string[];
}

export interface EventDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published" | "cancelled";
  seating: "general" | "assigned";
  visibility: "public" | "unlisted" | "private";
  paid_sales_status: "inactive" | "active" | "suspended";
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  refund_policy: string;
  remaining: number;
  isPreview: boolean;
  venue: { id: number; name: string; city: string; address: string; timezone: string; kind: string; map_image_url: string | null; has_seat_map: boolean; layout: StadiumLayout | null };
  sections: { code: string; name: string; price_category: string; view_image_url: string | null }[];
  ticketTypes: TicketTypePublic[];
  organizer: { id: number; display_name: string };
  calendar: { google: string; outlook: string };
  campaign: null | { code?: string; token?: string; discountType?: string; discountValue?: number; error?: string };
}

export interface StadiumLayout {
  type: "stadium";
  width: number;
  height: number;
  stands: Record<string, { name: string; color: string }>;
  sectors: { code: string; ring: number; index: number; side: string; tier: string }[];
}

export interface Seat {
  id: number;
  section: string;
  row: string;
  number: number;
  accessible: boolean;
  x: number;
  y: number;
  status: "available" | "held" | "sold" | "unavailable";
}

export interface SeatPrice {
  ticketTypeId: number;
  name: string;
  price: number;
}

export interface Quote {
  count: number;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  promo: { code: string } | null;
  promoError: string | null;
}

export type OrderStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
export type TicketStatus = "valid" | "checked_in" | "cancelled" | "refunded";

export interface OrderListItem {
  id: number;
  code: string;
  status: OrderStatus;
  total_kzt: number;
  created_at: string;
  reserved_until: string | null;
  event_id: number;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  event_status: string;
  venue_name: string;
  ticket_count: number;
}

export interface OrderTicket {
  id: number;
  code: string;
  status: TicketStatus;
  attendee_name: string;
  section_code: string | null;
  row_label: string | null;
  seat_number: number | null;
  ticket_type: string;
  qrPayload: string | null;
}

export interface OrderDetail {
  id: number;
  code: string;
  status: OrderStatus;
  event_id: number;
  user_id: number;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  event_status: string;
  refund_policy: string;
  venue_name: string;
  venue_address: string;
  timezone: string;
  subtotal_kzt: number;
  discount_kzt: number;
  fee_kzt: number;
  total_kzt: number;
  promo_code: string | null;
  attendee_name: string;
  attendee_email: string;
  reserved_until: string | null;
  tickets: OrderTicket[];
  items: { id: number; ticket_type: string; unit_price_kzt: number; discount_kzt: number; section_code: string | null; row_label: string | null; seat_number: number | null }[];
  payments: { id: number; provider: string; amount_kzt: number; status: string; is_demo: boolean; created_at: string }[];
  calendar: { google: string; outlook: string };
}

export interface MyTicket {
  id: number;
  code: string;
  status: TicketStatus;
  attendee_name: string;
  checked_in_at: string | null;
  section_code: string | null;
  row_label: string | null;
  seat_number: number | null;
  order_id: number;
  order_code: string;
  ticket_type: string;
  event_id: number;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  event_status: string;
  venue_name: string;
  city: string;
  timezone: string;
  qrPayload: string | null;
}

export interface Payment {
  id: number;
  purpose: "ticket_order" | "activation_fee";
  order_id: number | null;
  event_id: number;
  provider: "demo" | "halyk";
  amount_kzt: number;
  status: "pending" | "succeeded" | "failed";
  title: string;
  order_code: string | null;
  reserved_until: string | null;
  order_status: string | null;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type ScanResult = "valid" | "already_used" | "cancelled" | "refunded" | "wrong_event" | "campaign_qr" | "invalid";

export interface ScanTicket {
  id: number;
  code: string;
  status: TicketStatus;
  attendee_name: string;
  checked_in_at: string | null;
  section_code: string | null;
  row_label: string | null;
  seat_number: number | null;
  event_id: number;
  ticket_type: string;
  attendee_email?: string;
}

export interface CheckinStats {
  registered: number;
  checked_in: number;
}

export interface ScanResponse {
  result: ScanResult;
  message?: string;
  ticket?: ScanTicket;
  stats: CheckinStats;
}

export interface SupportCaseRow {
  id: number;
  code: string;
  kind: "attendee" | "organizer";
  category: string;
  subject: string;
  status: "open" | "in_progress" | "waiting_for_customer" | "resolved";
  event_title: string | null;
  requester_name?: string;
  updated_at: string;
  escalated: boolean;
}
