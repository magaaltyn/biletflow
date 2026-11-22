import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Chip, ErrorBox, Field, Loading, Notice, RowView, Screen, T } from "@/components/ui";
import { DateTimeField } from "@/components/widgets";
import { humanize } from "@/lib/format";
import { api } from "@/services/api";

// Same values as api/src/routes/organizer.ts (eventSchema)
const CATEGORIES = ["concert", "festival", "sports", "theatre", "conference", "education", "exhibition", "community", "other"] as const;
const VIS = ["public", "unlisted", "private"] as const;
interface Venue {
  id: number;
  name: string;
  city: string;
  address: string;
  kind: string;
  has_seat_map: boolean;
}

type FormState = {
  title: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  venueId: number;
  startsAt: Date | null;
  endsAt: Date | null;
  visibility: (typeof VIS)[number];
  seating: "general" | "assigned";
  capacity: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  refundPolicy: string;
};

function initialForm(e: any | undefined): FormState {
  if (e)
    return {
      title: e.title,
      description: e.description,
      category: e.category,
      venueId: e.venue_id,
      startsAt: new Date(e.starts_at),
      endsAt: new Date(e.ends_at),
      visibility: e.visibility,
      seating: e.seating,
      capacity: String(e.capacity),
      registrationOpensAt: e.registration_opens_at ? new Date(e.registration_opens_at) : null,
      registrationClosesAt: e.registration_closes_at ? new Date(e.registration_closes_at) : null,
      refundPolicy: e.refund_policy ?? "",
    };
  const start = new Date(Date.now() + 14 * 86_400_000);
  return { title: "", description: "", category: "concert", venueId: 0, startsAt: start, endsAt: new Date(start.getTime() + 3 * 3_600_000), visibility: "public", seating: "general", capacity: "100", registrationOpensAt: null, registrationClosesAt: null, refundPolicy: "" };
}

export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const existing = useQuery({ queryKey: ["org-event", id], enabled: editing, queryFn: () => api.get(`/organizer/events/${id}`) });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => api.get<Venue[]>("/venues") });
  if ((editing && existing.isLoading) || venues.isLoading) return <Loading />;
  return <EventForm id={id} initial={initialForm(existing.data)} venues={venues.data ?? []} reloadVenues={() => venues.refetch()} />;
}

function EventForm({ id, initial, venues, reloadVenues }: { id?: string; initial: FormState; venues: Venue[]; reloadVenues: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const editing = Boolean(id);
  const [f, setF] = useState<FormState>(initial);
  const [newVenue, setNewVenue] = useState<null | { name: string; city: string; address: string }>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const venue = venues.find((v) => v.id === f.venueId);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const validate = () => {
    if (f.title.trim().length < 3) return "Title: at least 3 characters";
    if (!f.venueId) return "Choose a venue";
    if (!f.startsAt || !f.endsAt) return "Set the start and end time";
    if (f.endsAt <= f.startsAt) return "The end time must be after the start time";
    if (!(Number(f.capacity) >= 1)) return "Capacity must be at least 1";
    if (f.registrationOpensAt && f.registrationClosesAt && f.registrationClosesAt <= f.registrationOpensAt) return "Registration must close after it opens";
    if (f.seating === "assigned" && !venue?.has_seat_map) return "Assigned seating needs a venue with a seat map";
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) return setErr(v);
    setBusy(true);
    setErr(null);
    const body = {
      title: f.title.trim(),
      description: f.description,
      category: f.category,
      venueId: f.venueId,
      startsAt: f.startsAt!.toISOString(),
      endsAt: f.endsAt!.toISOString(),
      visibility: f.visibility,
      seating: f.seating,
      capacity: Number(f.capacity),
      registrationOpensAt: f.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: f.registrationClosesAt?.toISOString() ?? null,
      ...(f.refundPolicy.trim() ? { refundPolicy: f.refundPolicy.trim() } : {}),
    };
    try {
      if (editing) {
        await api.patch(`/organizer/events/${id}`, body);
        await qc.invalidateQueries();
        router.back();
      } else {
        const e = await api.post<{ id: number }>("/organizer/events", body);
        await qc.invalidateQueries({ queryKey: ["org-events"] });
        router.replace(`/org-event/${e.id}`);
      }
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const createVenue = async () => {
    if (!newVenue) return;
    setErr(null);
    try {
      const v = await api.post<Venue>("/organizer/venues", { ...newVenue, kind: "hall" });
      await reloadVenues();
      set("venueId", v.id);
      setNewVenue(null);
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? "Edit event" : "Create event" }} />
      {!editing ? <Notice>New events are saved as drafts. Add ticket types, then publish from the event page.</Notice> : null}
      <Field label="Title *" value={f.title} onChangeText={(v) => set("title", v)} maxLength={150} />
      <Field label="Description" value={f.description} onChangeText={(v) => set("description", v)} multiline />
      <T v="label">Category *</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{CATEGORIES.map((c) => <Chip key={c} label={humanize(c)} active={f.category === c} onPress={() => set("category", c)} />)}</View>

      <Card>
        <T v="label">Venue *</T>
        {venues.map((v) => <Chip key={v.id} label={`${v.name} · ${v.city}${v.has_seat_map ? " · seat map" : ""}`} active={f.venueId === v.id} onPress={() => set("venueId", v.id)} />)}
        {newVenue ? (
          <>
            <Field label="Venue name" value={newVenue.name} onChangeText={(v) => setNewVenue({ ...newVenue, name: v })} />
            <Field label="City" value={newVenue.city} onChangeText={(v) => setNewVenue({ ...newVenue, city: v })} />
            <Field label="Address" value={newVenue.address} onChangeText={(v) => setNewVenue({ ...newVenue, address: v })} />
            <RowView>
              <Button small title="Add venue" onPress={createVenue} disabled={newVenue.name.length < 2 || newVenue.city.length < 2 || newVenue.address.length < 3} />
              <Button small v="ghost" title="Cancel" onPress={() => setNewVenue(null)} />
            </RowView>
          </>
        ) : (
          <Button small v="secondary" title="+ New venue" onPress={() => setNewVenue({ name: "", city: "Almaty", address: "" })} />
        )}
        {venue ? <T v="small">{venue.address} · times are in the venue’s time zone (Asia/Almaty)</T> : null}
      </Card>

      <DateTimeField label="Starts *" value={f.startsAt} onChange={(d) => set("startsAt", d)} />
      <DateTimeField label="Ends *" value={f.endsAt} onChange={(d) => set("endsAt", d)} />
      <Field label="Capacity *" value={f.capacity} onChangeText={(v) => set("capacity", v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <T v="label">Visibility</T>
      <RowView style={{ flexWrap: "wrap" }}>{VIS.map((v) => <Chip key={v} label={humanize(v)} active={f.visibility === v} onPress={() => set("visibility", v)} />)}</RowView>
      <T v="small">Public: listed in search. Unlisted: anyone with the link. Private: only with the invite link.</T>
      <T v="label">Seating</T>
      <RowView>
        <Chip label="General admission" active={f.seating === "general"} onPress={() => set("seating", "general")} />
        <Chip label="Assigned seats" active={f.seating === "assigned"} onPress={() => set("seating", "assigned")} />
      </RowView>
      <DateTimeField label="Registration opens (optional)" value={f.registrationOpensAt} onChange={(d) => set("registrationOpensAt", d)} optional />
      <DateTimeField label="Registration closes (optional)" value={f.registrationClosesAt} onChange={(d) => set("registrationClosesAt", d)} optional />
      <Field label="Refund policy" value={f.refundPolicy} onChangeText={(v) => set("refundPolicy", v)} placeholder="Refunds are possible until 48 hours before the event." multiline />
      <ErrorBox error={err} />
      <Button title={editing ? "Save changes" : "Save draft"} onPress={save} loading={busy} />
    </Screen>
  );
}
