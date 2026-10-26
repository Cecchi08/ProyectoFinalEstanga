import { useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { Availability, OccupancyMode, Quote, Reservation, VenueDetail } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Notice, Page, ResourceState, money, styles, useAction } from "../../components/ui";
import { capacityLabel } from "./MarketplaceScreen";
import { days, isDate, range, slot } from "./time";

const modes: [OccupancyMode, string][] = [["VENUE", "Solo el espacio"], ["ESTABLISHMENT", "Establecimiento completo"]];
export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const resource = useResource<VenueDetail>(`/marketplace/venues/${id}`);
  const venue = resource.result?.data;
  const [form, setForm] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<OccupancyMode>("VENUE");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const check = useAction();
  const book = useAction();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const requester = can("marketplace.quotes.request", "marketplace.reservations.create", "marketplace.admin");
  // Whole day (no times) or the exact requested slot.
  const lookup = () => check.run(async () => {
    if (!isDate(form.date ?? "")) throw new Error("Ingresá la fecha como AAAA-MM-DD.");
    const exact = form.start && form.end ? slot(form.date, { setup: form.setup, start: form.start, end: form.end, teardown: form.teardown }) : null;
    const params = exact ? { from: exact.setup_start_at, to: exact.teardown_end_at, mode } : { date: form.date, mode };
    setAvailability((await api.request<Availability>(`/marketplace/venues/${id}/availability${query(params)}`)).data);
  });
  const schedule = () => {
    if (!form.event_name?.trim()) throw new Error("Poné un nombre al evento.");
    if (!form.start || !form.end) throw new Error("Completá inicio y fin del evento.");
    return {
      venue_id: id, occupancy_mode: mode, event_name: form.event_name.trim(),
      expected_attendance: form.attendance ? Number(form.attendance) : null,
      ...slot(form.date ?? "", { setup: form.setup, start: form.start, end: form.end, teardown: form.teardown }),
    };
  };
  const reserve = () => book.run(async () => {
    const { data } = await api.request<Reservation>("/marketplace/reservations", { method: "POST", body: { ...schedule(), notes: form.notes?.trim() || null } });
    router.push(`/marketplace/reservations/${data.id}`);
  });
  const requestQuote = () => book.run(async () => {
    const { data } = await api.request<Quote>("/marketplace/quotes", {
      method: "POST", body: { ...schedule(), event_description: form.description?.trim() || null, requester_notes: form.notes?.trim() || null },
    });
    router.push(`/marketplace/quotes/${data.id}`);
  });
  return (
    <Page title={venue?.name ?? "Espacio"} subtitle={venue ? `${venue.establishment_name} · ${venue.city_name}` : undefined}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {venue && (
        <>
          {venue.photos.length > 0 && (
            <View style={styles.row}>
              {venue.photos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.url }} accessibilityLabel={`Foto de ${venue.name}`}
                  style={{ width: photo.is_cover ? "100%" : 160, height: photo.is_cover ? 240 : 110, borderRadius: 14 }} />
              ))}
            </View>
          )}
          <Card>
            <Copy>{venue.venue_type_name} · {money(venue.price_per_hour)} por hora</Copy>
            <Copy muted>{venue.address_line} · {venue.city_name}</Copy>
            <Copy muted>{capacityLabel(venue)}{venue.area_m2 ? ` · ${venue.area_m2} m²` : ""}</Copy>
            <Copy muted>Reserva mínima: {venue.min_booking_minutes} min · La reserva temporal dura {venue.hold_minutes} min hasta pagar.</Copy>
            {venue.description && <Copy>{venue.description}</Copy>}
            {venue.amenities.length > 0 && <Copy muted>Comodidades: {venue.amenities.map((a) => a.name).join(", ")}</Copy>}
            {venue.opening_hours.length > 0 && (
              <Copy muted>Horarios: {venue.opening_hours.map((h) => `${days[h.day_of_week]} ${h.opens_at}–${h.closes_at}`).join(" · ")}</Copy>
            )}
          </Card>
          <Card>
            <Copy>Disponibilidad y franja (hora de Argentina)</Copy>
            <View style={styles.row}>
              <Field label="Fecha (AAAA-MM-DD)" value={form.date ?? ""} onChangeText={(v) => set("date", v)} />
              <Field label="Armado desde (HH:MM, opcional)" value={form.setup ?? ""} onChangeText={(v) => set("setup", v)} />
              <Field label="Inicio del evento (HH:MM)" value={form.start ?? ""} onChangeText={(v) => set("start", v)} />
              <Field label="Fin del evento (HH:MM)" value={form.end ?? ""} onChangeText={(v) => set("end", v)} />
              <Field label="Desarme hasta (HH:MM, opcional)" value={form.teardown ?? ""} onChangeText={(v) => set("teardown", v)} />
            </View>
            <View style={styles.row}>
              {modes.map(([code, label]) => (
                <Button key={code} title={`${mode === code ? "✓ " : ""}${label}`} secondary={mode !== code} onPress={() => setMode(code)} />
              ))}
            </View>
            <Button title="Consultar disponibilidad" secondary disabled={check.busy} onPress={() => void lookup()} />
            <ActionFeedback action={check} />
            {availability && (
              <>
                {availability.available !== undefined && (
                  <Notice message={availability.available ? "La franja está libre." : "La franja está ocupada."} error={!availability.available} />
                )}
                {availability.busy.length === 0 ? (
                  <Copy muted>Sin ocupación en el período consultado.</Copy>
                ) : (
                  availability.busy.map((busy) => (
                    <Copy key={`${busy.starts_at}-${busy.ends_at}-${busy.source}`} muted>
                      Ocupado {range(busy.starts_at, busy.ends_at)} · {busy.source === "BLOCK" ? "bloqueo" : "reserva"}
                      {busy.scope === "ESTABLISHMENT" ? " (todo el establecimiento)" : ""}
                    </Copy>
                  ))
                )}
              </>
            )}
          </Card>
          {requester ? (
            <Card>
              <Copy>Reservar o pedir presupuesto</Copy>
              <Field label="Nombre del evento" value={form.event_name ?? ""} onChangeText={(v) => set("event_name", v)} />
              <Field label="Asistentes estimados (opcional)" keyboardType="number-pad" value={form.attendance ?? ""} onChangeText={(v) => set("attendance", v)} />
              <Field label="Descripción (para presupuesto)" multiline value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
              <Field label="Notas (opcional)" multiline value={form.notes ?? ""} onChangeText={(v) => set("notes", v)} />
              <ActionFeedback action={book} />
              <View style={styles.row}>
                <Button title="Reservar al precio de lista" disabled={book.busy || mode !== "VENUE"} onPress={() => void reserve()} />
                <Button title="Pedir presupuesto" secondary disabled={book.busy} onPress={() => void requestQuote()} />
              </View>
              <Copy muted>
                {mode === "VENUE"
                  ? "La reserva queda temporal (HOLD) hasta el pago simulado. Usa la fecha y los horarios de arriba."
                  : "El establecimiento completo se reserva solo con presupuesto."}
              </Copy>
            </Card>
          ) : (
            <Copy muted>Ingresá con una cuenta registrada para reservar o pedir presupuesto.</Copy>
          )}
        </>
      )}
    </Page>
  );
}
