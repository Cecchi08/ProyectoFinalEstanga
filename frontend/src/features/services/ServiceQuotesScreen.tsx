import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { ServiceAvailability, ServiceQuote } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, FormScope, Page, Pager, ResourceState, dateLabel, money, styles, useAction, useForm } from "../../components/ui";
import { useListView } from "../marketplace/QuotesScreen";
import { at, isDate, range } from "../marketplace/time";

const STATUS: Record<ServiceQuote["status"], string> = {
  REQUESTED: "Pedida", SENT: "Cotizada", ACCEPTED: "Contratada", REJECTED: "Rechazada", EXPIRED: "Vencida", CANCELLED: "Cancelada",
};
// GET /services/quotes: as=requester needs services.quotes.request and as=provider services.quotes.respond, so an
// EMPRESA_SERVICIOS account (which does not request) only gets the company view.
export default function ServiceQuotesScreen() {
  const view = useListView(Object.keys(STATUS), ["services.quotes.respond", "services.admin"],
    { requesterPermissions: ["services.quotes.request", "services.admin"], providerLabel: "Recibidas en mis empresas" });
  const resource = useResource<ServiceQuote[]>(`/services/quotes${view.params}`);
  return (
    <Page title="Cotizaciones de servicios" subtitle="Pedidos a empresas de servicios y sus respuestas.">
      <Button title="Buscar servicios" secondary onPress={() => router.push("/services")} />
      {view.controls}
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((quote) => (
        <Card key={quote.id}>
          <Copy>{quote.event_name} · {STATUS[quote.status]}</Copy>
          <Copy muted>{quote.offering_name} · {quote.provider_name} · {range(quote.event_start_at, quote.event_end_at)}</Copy>
          <Copy muted>{quote.total_amount ? `Total ${money(quote.total_amount)}` : "Sin cotizar"} · {quote.public_code}</Copy>
          <Button title={`Ver cotización ${quote.public_code}`} secondary onPress={() => router.push(`/services/quotes/${quote.id}`)} />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={view.setPage} />
    </Page>
  );
}

type Line = { description: string; quantity: string; unit_price: string };
// The company answers (respond/reject) while REQUESTED or SENT; the requester accepts a SENT quote before valid_until,
// which is what contracts the service, and may cancel it while open or, once accepted, before the service starts.
// There is no payment for services in Venti: the agreed total is settled between the parties.
export function ServiceQuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const resource = useResource<ServiceQuote>(`/services/quotes/${id}`);
  const quote = resource.result?.data;
  const action = useAction();
  const validation = useForm();
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: "1", unit_price: "" }]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const mine = quote?.requester_user_id === user?.id;
  const provider = !mine && can("services.quotes.respond", "services.admin");
  const open = quote && ["REQUESTED", "SENT"].includes(quote.status);
  // Members see which contracted quote holds each overlapping window.
  const overlap = useResource<ServiceAvailability>(provider && open && quote
    ? `/services/offerings/${quote.offering_id}/availability${query({ from: quote.event_start_at, to: quote.event_end_at })}` : null);
  const busy = overlap.result?.data.busy.filter((slot) => slot.quote_id !== quote?.id) ?? [];
  const post = (path: string, message: string, body: () => unknown = () => ({})) => action.run(async () => {
    await api.request(`/services/quotes/${id}/${path}`, { method: "POST", body: body() });
    setConfirm(false);
    await resource.reload();
    action.setMessage(message);
  });
  const respond = () => post("respond", "Cotización enviada.", () => {
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
  const cancellable = mine && quote && (open || (quote.status === "ACCEPTED" && new Date(quote.event_start_at) > new Date()));
  return (
    <Page title={quote ? `Cotización ${quote.public_code}` : "Cotización"}>
      <FormScope form={validation}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {quote && (
        <>
          <Card>
            <Copy>{quote.event_name} · {STATUS[quote.status]}</Copy>
            <Copy muted>{quote.offering_name} ({quote.category_name}) · {quote.provider_name}</Copy>
            <Copy muted>Servicio: {range(quote.event_start_at, quote.event_end_at)}{quote.location_text ? ` · ${quote.location_text}` : ""}</Copy>
            {!mine && <Copy muted>Pedido por {quote.requester_name ?? quote.requester_email} · {quote.requester_email}</Copy>}
            {quote.concert_name && <Copy muted>Concierto: {quote.concert_name}</Copy>}
            {quote.reservation_code && <Copy muted>Reserva de espacio: {quote.reservation_code}</Copy>}
            {quote.requester_notes && <Copy muted>Notas del pedido: {quote.requester_notes}</Copy>}
            {quote.accepted_at && <Copy muted>Contratada {dateLabel(quote.accepted_at)}</Copy>}
          </Card>
          {quote.items && quote.items.length > 0 && (
            <Card>
              {quote.items.map((item) => (
                <Copy key={item.id}>{item.description} · {item.quantity} × {money(item.unit_price)} = {money(item.line_total)}</Copy>
              ))}
              <Copy muted>Subtotal {money(quote.subtotal ?? 0)} · Cargos {money(quote.fees ?? 0)} · Descuento {money(quote.discount ?? 0)}</Copy>
              <Copy>Total {money(quote.total_amount ?? 0)} {quote.currency}</Copy>
              {quote.valid_until && <Copy muted>Válida hasta {dateLabel(quote.valid_until)}</Copy>}
              {quote.provider_notes && <Copy muted>Notas de la empresa: {quote.provider_notes}</Copy>}
              <Copy muted>Venti no cobra servicios: el total se arregla directamente con la empresa.</Copy>
            </Card>
          )}
          {mine && quote.status === "SENT" && (
            <Button title="Aceptar y contratar" disabled={action.busy} onPress={() => void post("accept", "Servicio contratado.")} />
          )}
          {cancellable && (
            <Button title={confirm ? "Confirmar cancelación" : quote.status === "ACCEPTED" ? "Cancelar contratación" : "Cancelar pedido"}
              secondary danger disabled={action.busy}
              onPress={() => (confirm ? void post("cancel", "Cotización cancelada.", () => ({ reason: form.reason?.trim() || null })) : setConfirm(true))} />
          )}
          {cancellable && confirm && (
            <Field label="Motivo de la cancelación (opcional)" value={form.reason ?? ""} onChangeText={(v) => set("reason", v)} />
          )}
          {provider && open && (
            <Card>
              <Copy>Responder con una cotización</Copy>
              {busy.length > 0 && (
                <Copy muted>
                  Ya hay {busy.length} {busy.length === 1 ? "contratación" : "contrataciones"} de este servicio en ese horario:{" "}
                  {busy.map((slot) => slot.event_name ?? range(slot.starts_at, slot.ends_at)).join(", ")}.
                </Copy>
              )}
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
                <Field label="Válida hasta (AAAA-MM-DD)" value={form.valid_date ?? ""} onChangeText={(v) => set("valid_date", v)} />
                <Field label="Hora límite (HH:MM)" placeholder="23:59" value={form.valid_time ?? ""} onChangeText={(v) => set("valid_time", v)} />
              </View>
              <Copy muted>La validez tiene que vencer antes del inicio del servicio.</Copy>
              <Field label="Notas para el cliente" multiline value={form.provider_notes ?? ""} onChangeText={(v) => set("provider_notes", v)} />
              <View style={styles.row}>
                <Button title={quote.status === "SENT" ? "Reenviar cotización" : "Enviar cotización"} disabled={action.busy} onPress={() => void respond()} />
                <Button title="Rechazar pedido" secondary danger disabled={action.busy}
                  onPress={() => void post("reject", "Pedido rechazado.", () => ({ provider_notes: form.provider_notes?.trim() || null }))} />
              </View>
            </Card>
          )}
        </>
      )}
      <Button title="Volver a cotizaciones" secondary onPress={() => router.push("/services/quotes")} />
      </FormScope>
    </Page>
  );
}
