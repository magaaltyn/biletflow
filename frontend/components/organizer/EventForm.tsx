"use client";
import { translate, useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api, toLocalInput } from "@/lib/api";
import { Button, ErrorBox, Field, Input, Select, Textarea } from "../ui";

const CATEGORIES = ["concert", "festival", "sports", "theatre", "conference", "education", "exhibition", "community", "other"];

export interface EventFormValue {
  title: string;
  description: string;
  category: string;
  venueId: number | "";
  startsAt: string;
  endsAt: string;
  visibility: string;
  seating: string;
  capacity: number | "";
  registrationOpensAt: string;
  registrationClosesAt: string;
  refundPolicy: string;
}

export function fromEvent(e: any): EventFormValue {
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    venueId: e.venue_id,
    startsAt: toLocalInput(e.starts_at),
    endsAt: toLocalInput(e.ends_at),
    visibility: e.visibility,
    seating: e.seating,
    capacity: e.capacity,
    registrationOpensAt: toLocalInput(e.registration_opens_at),
    registrationClosesAt: toLocalInput(e.registration_closes_at),
    refundPolicy: e.refund_policy,
  };
}

const empty: EventFormValue = { title: "", description: "", category: "concert", venueId: "", startsAt: "", endsAt: "", visibility: "public", seating: "general", capacity: 100, registrationOpensAt: "", registrationClosesAt: "", refundPolicy: "Refunds are possible until 48 hours before the event." };

function NewVenue({ onCreated }: { onCreated: (id: number) => void }) {
  useT();
  const [v, setV] = useState({ name: "", city: "Almaty", address: "", kind: "hall" });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const venue = await api<{ id: number }>("/organizer/venues", { body: v });
      if (file) {
        const form = new FormData();
        form.append("image", file);
        await api(`/organizer/venues/${venue.id}/map-image`, { form });
      }
      onCreated(venue.id);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 rounded-xl border border-dashed border-line bg-slate-50 p-4 sm:grid-cols-2">
      <Field label={translate('Venue name')}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label={translate('City')}><Input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
      <Field label={translate('Address')}><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
      <Field label={translate('Type')}>
        <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          {["hall", "arena", "stadium", "theatre", "outdoor"].map((k) => <option key={k} value={k}>{translate(k)}</option>)}
        </Select>
      </Field>
      <Field label={translate('Venue / stadium map picture (optional)')} hint={translate('JPG, PNG, WEBP or SVG, up to 5 MB. Shown on the event page.')}>
        <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <div className="flex items-end"><Button type="button" variant="secondary" onClick={create} loading={busy}>{translate('Add venue')}</Button></div>
      <div className="sm:col-span-2"><ErrorBox error={err} /></div>
    </div>
  );
}

export function EventForm({ initial, submitLabel, onSubmit }: { initial?: EventFormValue; submitLabel: string; onSubmit: (v: any) => Promise<void> }) {
  useT();
  const [f, setF] = useState<EventFormValue>(initial ?? empty);
  const [venues, setVenues] = useState<any[]>([]);
  const [addVenue, setAddVenue] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const loadVenues = () => api<any[]>("/venues").then(setVenues).catch(setErr);
  useEffect(() => {
    void loadVenues();
  }, []);
  const venue = venues.find((v) => v.id === Number(f.venueId));
  const set = <K extends keyof EventFormValue>(k: K, v: EventFormValue[K]) => setF({ ...f, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const iso = (s: string) => (s ? new Date(s).toISOString() : null);
    try {
      await onSubmit({
        ...f,
        venueId: Number(f.venueId),
        capacity: Number(f.capacity),
        startsAt: iso(f.startsAt),
        endsAt: iso(f.endsAt),
        registrationOpensAt: iso(f.registrationOpensAt),
        registrationClosesAt: iso(f.registrationClosesAt),
      });
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={translate('Title')}><Input required minLength={3} value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label={translate('Description')}><Textarea rows={5} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={translate('Category')}><Select value={f.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{translate(c)}</option>)}</Select></Field>
        <Field label={translate('Visibility')} hint={translate('Unlisted: only people with the link. Private: invite link with a key.')}>
          <Select value={f.visibility} onChange={(e) => set("visibility", e.target.value)}>
            <option value="public">{translate('Public')}</option>
            <option value="unlisted">{translate('Unlisted')}</option>
            <option value="private">{translate('Private')}</option>
          </Select>
        </Field>
        <Field label={translate('Capacity')}><Input type="number" min={1} required value={f.capacity} onChange={(e) => set("capacity", e.target.value === "" ? "" : Number(e.target.value))} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={translate('Starts (Almaty time)')}><Input type="datetime-local" required value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
        <Field label={translate('Ends')}><Input type="datetime-local" required value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field>
        <Field label={translate('Registration opens (optional)')}><Input type="datetime-local" value={f.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} /></Field>
        <Field label={translate('Registration closes (optional)')}><Input type="datetime-local" value={f.registrationClosesAt} onChange={(e) => set("registrationClosesAt", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={translate('Venue')}>
          <Select required value={f.venueId} onChange={(e) => set("venueId", e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">{translate('Choose a venue')}</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.city}{v.has_seat_map ? " · seat map" : ""}</option>)}
          </Select>
        </Field>
        <Field label={translate('Seating')} hint={venue && !venue.has_seat_map ? translate("This venue has no seat map, so only general admission is possible.") : translate("Assigned seating uses the venue's predefined seat map.")}>
          <Select value={f.seating} onChange={(e) => set("seating", e.target.value)}>
            <option value="general">{translate('General admission')}</option>
            <option value="assigned" disabled={venue && !venue.has_seat_map}>{translate('Assigned seating')}</option>
          </Select>
        </Field>
      </div>
      {venue?.map_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={venue.map_image_url} alt={`Map of ${venue.name}`} className="max-h-64 rounded-xl border border-line" />
      )}
      <button type="button" className="text-sm font-semibold text-brand" onClick={() => setAddVenue(!addVenue)}>{addVenue ? translate("Hide") : translate("+ Add your own venue with a map picture")}</button>
      {addVenue && (
        <NewVenue
          onCreated={async (id) => {
            await loadVenues();
            set("venueId", id);
            setAddVenue(false);
          }}
        />
      )}
      <Field label={translate('Refund policy')}><Textarea rows={2} value={f.refundPolicy} onChange={(e) => set("refundPolicy", e.target.value)} /></Field>
      <ErrorBox error={err} />
      <Button type="submit" loading={busy}>{submitLabel}</Button>
    </form>
  );
}
