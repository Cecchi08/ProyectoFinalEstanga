import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { Permission, Quote, Reservation } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, FormScope, Page, Pager, ResourceState, dateLabel, money, styles, useAction, useForm } from "../../components/ui";
import { at, isDate, range } from "./time";

// Shared by quotes and reservations: requester view by default, provider view for organization members.
// `as=provider` is authorized by a different permission on each list, so the caller passes it. The requester view also
// needs a permission, so an account without it (a VENUE or EMPRESA_SERVICIOS that only answers) gets the provider view.
export function useListView(statuses: string[], providerPermissions: Permission[],
  { requesterPermissions, providerLabel = "Recibidos en mis espacios" }: { requesterPermissions?: Permission[]; providerLabel?: string } = {}) {
  const { can } = useAuth();
  const provider = can(...providerPermissions);
  const requester = !requesterPermissions || can(...requesterPermissions);
  const [choice, setAs] = useState<"requester" | "provider">("requester");
  const as = requester ? choice : "provider";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const controls = (
    <>
      {provider && requester && (
        <View style={styles.row}>
          {(["requester", "provider"] as const).map((value) => (
            <Button key={value} title={value === "requester" ? "Pedidos míos" : providerLabel} secondary={as !== value}
              onPress={() => { setAs(value); setPage(1); }} />
          ))}
        </View>
      )}
      <View style={styles.row}>
        {["", ...statuses].map((value) => (
          <Button key={value} title={value || "Todos"} secondary={status !== value} onPress={() => { setStatus(value); setPage(1); }} />
        ))}
      </View>
    </>
  );
  return { params: query({ as, status, page }), controls, setPage };
}

export default function QuotesScreen() {
  const view = useListView(["REQUESTED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"], ["marketplace.quotes.respond", "marketplace.admin"],
    { requesterPermissions: ["marketplace.quotes.request", "marketplace.admin"] });
  const resource = useResource<Quote[]>(`/marketplace/quotes${view.params}`);
  return (
    <Page title="Presupuestos" subtitle="Pedidos de presupuesto para espacios del marketplace.">
      <Button title="Buscar espacios" secondary onPress={() => router.push("/marketplace")} />
      {view.controls}
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((quote) => (
        <Card key={quote.id}>
          <Copy>{quote.event_name} · {quote.status}</Copy>
          <Copy muted>{quote.venue_name} · {range(quote.event_start_at, quote.event_end_at)}</Copy>
          <Copy muted>{quote.total_amount ? `Total ${money(quote.total_amount)}` : "Sin cotizar"} · {quote.public_code}</Copy>
          <Button title={`Ver presupuesto ${quote.public_code}`} secondary onPress={() => router.push(`/marketplace/quotes/${quote.id}`)} />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={view.setPage} />
    </Page>
  );
}

type Line = { description: string; quantity: string; unit_price: string };
export function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const resource = useResource<Quote>(`/marketplace/quotes/${id}`);
  const quote = resource.result?.data;
  const action = useAction();
  const validation = useForm();
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: "1", unit_price: "" }]);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const mine = quote?.requester_user_id === user?.id;
  // The backend decides membership; organizers only see the provider form for quotes they did not request.
  const provider = !mine && can("marketplace.quotes.respond", "marketplace.admin");
  const open = quote && ["REQUESTED", "SENT"].includes(quote.status);
  // The body is built inside run() so validation errors are shown like API errors.
  const post = (path: string, body: () => unknown = () => ({})) => action.run(async () => {
    await api.request(`/marketplace/quotes/${id}/${path}`, { method: "POST", body: body() });
    await resource.reload();
    action.setMessage("Presupuesto actualizado.");
  });
  const respond = () => post("respond", () => {
    validation.assertValid();
    if (!isDate(form.valid_date ?? "")) throw new Error("Indicá la fecha de validez (AAAA-MM-DD).");
    const items = lines.filter((line) => line.description.trim()).map((line) => ({
      description: line.description.trim(), quantity: Number(line.quantity), unit_price: Number(line.unit_price),
    }));
    if (!items.length || items.some((item) => !Number.isFinite(item.quantity) || !Number.isFinite(item.unit_price)))
      throw new Error("Cada ítem necesita descripción, cantidad y precio numéricos.");
    return {
      items, fees: Number(form.fees || 0), discount: Number(form.discount || 0),
      valid_until: at(form.valid_date ?? "", form.valid_time || "23:59").toISOString(), provider_notes: form.provider_notes?.trim() || null,
    };
  });
  const accept = () => action.run(async () => {
    const { data } = await api.request<{ reservation: Reservation }>(`/marketplace/quotes/${id}/accept`, { method: "POST", body: {} });
    router.push(`/marketplace/reservations/${data.reservation.id}`);
  });
  return (
    <Page title={quote ? `Presupuesto ${quote.public_code}` : "Presupuesto"}>
      <FormScope form={validation}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {quote && (
        <>
          <Card>
            <Copy>{quote.event_name} · {quote.status}</Copy>
            <Copy muted>{quote.venue_name} · {quote.occupancy_mode === "ESTABLISHMENT" ? "Establecimiento completo" : "Solo el espacio"}</Copy>
            <Copy muted>Ocupación: {range(quote.setup_start_at, quote.teardown_end_at)} · Evento: {range(quote.event_start_at, quote.event_end_at)}</Copy>
            {quote.expected_attendance ? <Copy muted>Asistentes estimados: {quote.expected_attendance}</Copy> : null}
            {quote.event_description && <Copy>{quote.event_description}</Copy>}
            {quote.requester_notes && <Copy muted>Notas del pedido: {quote.requester_notes}</Copy>}
          </Card>
          {quote.items && quote.items.length > 0 && (
            <Card>
              {quote.items.map((item) => (
                <Copy key={item.id}>{item.description} · {item.quantity} × {money(item.unit_price)} = {money(item.line_total)}</Copy>
              ))}
              <Copy muted>Subtotal {money(quote.subtotal ?? 0)} · Cargos {money(quote.fees ?? 0)} · Descuento {money(quote.discount ?? 0)}</Copy>
              <Copy>Total {money(quote.total_amount ?? 0)}</Copy>
              {quote.valid_until && <Copy muted>Válido hasta {dateLabel(quote.valid_until)}</Copy>}
              {quote.provider_notes && <Copy muted>Notas del espacio: {quote.provider_notes}</Copy>}
            </Card>
          )}
          {quote.reservation_id && (
            <Button title="Ver reserva del presupuesto" onPress={() => router.push(`/marketplace/reservations/${quote.reservation_id}`)} />
          )}
          {mine && open && (
            <View style={styles.row}>
              {quote.status === "SENT" && <Button title="Aceptar y reservar" disabled={action.busy} onPress={() => void accept()} />}
              <Button title="Cancelar pedido" secondary danger disabled={action.busy} onPress={() => void post("cancel")} />
            </View>
          )}
          {provider && open && (
            <Card>
              <Copy>Responder con un presupuesto</Copy>
              {lines.map((line, index) => (
                <View key={index} style={styles.row}>
                  {(["description", "quantity", "unit_price"] as const).map((key) => (
                    <Field key={key} label={`${{ description: "Ítem", quantity: "Cantidad", unit_price: "Precio unitario" }[key]} ${index + 1}`}
                      value={line[key]} onChangeText={(v) => setLines(lines.map((current, i) => (i === index ? { ...current, [key]: v } : current)))} />
                  ))}
                </View>
              ))}
              <Button title="Agregar ítem" secondary onPress={() => setLines([...lines, { description: "", quantity: "1", unit_price: "" }])} />
              <View style={styles.row}>
                <Field label="Cargos" keyboardType="decimal-pad" value={form.fees ?? ""} onChangeText={(v) => set("fees", v)} />
                <Field label="Descuento" keyboardType="decimal-pad" value={form.discount ?? ""} onChangeText={(v) => set("discount", v)} />
                <Field label="Válido hasta (AAAA-MM-DD)" value={form.valid_date ?? ""} onChangeText={(v) => set("valid_date", v)} />
                <Field label="Hora límite (HH:MM)" placeholder="23:59" value={form.valid_time ?? ""} onChangeText={(v) => set("valid_time", v)} />
              </View>
              <Field label="Notas para el cliente" multiline value={form.provider_notes ?? ""} onChangeText={(v) => set("provider_notes", v)} />
              <View style={styles.row}>
                <Button title="Enviar presupuesto" disabled={action.busy} onPress={() => void respond()} />
                <Button title="Rechazar pedido" secondary danger disabled={action.busy}
                  onPress={() => void post("reject", () => ({ provider_notes: form.provider_notes?.trim() || null }))} />
              </View>
            </Card>
          )}
        </>
      )}
      </FormScope>
    </Page>
  );
}
