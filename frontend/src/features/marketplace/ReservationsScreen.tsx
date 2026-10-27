import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { PaymentResult, Reservation } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Notice, Page, Pager, ResourceState, dateLabel, money, styles, useAction } from "../../components/ui";
import { useListView } from "./QuotesScreen";
import { range } from "./time";

const phases: Record<string, string> = { SETUP: "Armado", EVENT: "Evento", TEARDOWN: "Desarme" };
// A direct booking (no quote) is paid first and then accepted by the venue; until then it stays HOLD.
const stateLabel = (reservation: Reservation) =>
  reservation.awaiting_venue ? `${reservation.status} · pagada, espera aceptación del espacio`
    : reservation.status === "HOLD" && reservation.requires_venue_acceptance ? `${reservation.status} · pendiente de pago` : reservation.status;
export default function ReservationsScreen() {
  const view = useListView(["HOLD", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED"], ["marketplace.reservations.manage", "marketplace.admin"],
    { requesterPermissions: ["marketplace.reservations.create", "marketplace.admin"] });
  const resource = useResource<Reservation[]>(`/marketplace/reservations${view.params}`);
  return (
    <Page title="Reservas de espacios" subtitle="Reservas temporales, confirmadas y su historial.">
      <Button title="Buscar espacios" secondary onPress={() => router.push("/marketplace")} />
      {view.controls}
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((reservation) => (
        <Card key={reservation.id}>
          <Copy>{reservation.event_name} · {stateLabel(reservation)}</Copy>
          <Copy muted>{reservation.venue_name} · {reservation.establishment_name}</Copy>
          <Copy muted>{range(reservation.event_start_at, reservation.event_end_at)} · {money(reservation.total_amount)} · {reservation.public_code}</Copy>
          <Button title={`Ver reserva ${reservation.public_code}`} onPress={() => router.push(`/marketplace/reservations/${reservation.id}`)} />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={view.setPage} />
    </Page>
  );
}

export function ReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const resource = useResource<Reservation>(`/marketplace/reservations/${id}`);
  const reservation = resource.result?.data;
  const action = useAction();
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const mine = reservation?.user_id === user?.id;
  // The backend checks membership of the venue's organization; this only decides whether to offer the buttons.
  const venueSide = !mine && can("marketplace.reservations.manage", "marketplace.admin");
  const decide = (path: "accept" | "reject") => action.run(async () => {
    if (path === "reject" && reason.trim().length < 3) throw new Error("Indicá el motivo del rechazo (mínimo 3 caracteres).");
    await api.request(`/marketplace/reservations/${id}/${path}`, { method: "POST", body: path === "reject" ? { reason: reason.trim() } : {} });
    await resource.reload();
    action.setMessage(path === "accept" ? "Reserva aceptada y confirmada." : "Reserva rechazada: el pago simulado se marca como reembolsado.");
  });
  // Payments are always simulated: the request carries only the desired outcome, never card data.
  const pay = (outcome: "APPROVED" | "REJECTED") => action.run(async () => {
    const { data } = await api.request<PaymentResult>(`/marketplace/reservations/${id}/payments`, { method: "POST", body: { outcome } });
    setNotice(`${data.notice} Referencia ${data.payment.simulated_reference} · ${data.payment.status}.`);
    await resource.reload();
  });
  const cancel = () => action.run(async () => {
    await api.request(`/marketplace/reservations/${id}/cancel`, { method: "POST", body: { reason: reason.trim() || null } });
    setConfirm(false);
    await resource.reload();
    action.setMessage("Reserva cancelada.");
  });
  return (
    <Page title={reservation ? `Reserva ${reservation.public_code}` : "Reserva"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <Notice message={notice} />
      <ActionFeedback action={action} />
      {reservation && (
        <>
          <Card>
            <Copy>{reservation.event_name} · {stateLabel(reservation)}</Copy>
            <Copy muted>{reservation.venue_name} · {reservation.establishment_name}</Copy>
            <Copy muted>{reservation.occupancy_mode === "ESTABLISHMENT" ? "Establecimiento completo" : "Solo el espacio"} · Total {money(reservation.total_amount)}</Copy>
            {reservation.status === "HOLD" && reservation.hold_expires_at && (
              <Copy muted>
                Reserva temporal: vence {dateLabel(reservation.hold_expires_at)}
                {reservation.awaiting_venue ? " si el espacio no la acepta (el pago se reembolsa)." : " si no se paga."}
              </Copy>
            )}
            {reservation.notes && <Copy muted>Notas: {reservation.notes}</Copy>}
            {reservation.cancellation_reason && <Copy muted>Motivo de cancelación: {reservation.cancellation_reason}</Copy>}
            {reservation.occupancies?.map((o) => <Copy key={o.phase} muted>{phases[o.phase] ?? o.phase}: {range(o.starts_at, o.ends_at)}</Copy>)}
            {reservation.quote_id && (
              <Button title="Ver presupuesto de origen" secondary onPress={() => router.push(`/marketplace/quotes/${reservation.quote_id}`)} />
            )}
          </Card>
          {mine && reservation.status === "HOLD" && !reservation.paid && (
            <Card>
              <Copy>Pago simulado</Copy>
              <Copy muted>
                Venti no procesa pagos reales: no se cobra dinero ni se piden datos de tarjeta. Elegí el resultado para probar el flujo.
              </Copy>
              {reservation.requires_venue_acceptance && (
                <Copy muted>El pago confirma la compra; la reserva queda confirmada cuando el espacio la acepta.</Copy>
              )}
              <View style={styles.row}>
                <Button title="Simular pago aprobado" disabled={action.busy} onPress={() => void pay("APPROVED")} />
                <Button title="Simular pago rechazado" secondary disabled={action.busy} onPress={() => void pay("REJECTED")} />
              </View>
            </Card>
          )}
          {venueSide && reservation.status === "HOLD" && reservation.requires_venue_acceptance && (
            <Card>
              <Copy>Decisión del espacio</Copy>
              <Copy muted>
                {reservation.paid ? "El cliente ya pagó (simulado). Aceptá para confirmar la reserva o rechazala con un motivo."
                  : "Se puede aceptar cuando el cliente haya pagado. Rechazar libera la franja."}
              </Copy>
              <Field label="Motivo del rechazo" value={reason} onChangeText={setReason} />
              <View style={styles.row}>
                <Button title="Aceptar reserva" disabled={action.busy || !reservation.paid} onPress={() => void decide("accept")} />
                <Button title="Rechazar reserva" secondary danger disabled={action.busy} onPress={() => void decide("reject")} />
              </View>
            </Card>
          )}
          {(reservation.payments?.length ?? 0) > 0 && (
            <Card>
              <Copy>Pagos (simulados)</Copy>
              {reservation.payments?.map((payment) => (
                <Copy key={payment.id} muted>
                  {payment.simulated_reference} · {payment.status} · {money(payment.amount)} · {payment.is_simulated ? "simulado" : ""}
                  {payment.processed_at ? ` · ${dateLabel(payment.processed_at)}` : ""}
                </Copy>
              ))}
            </Card>
          )}
          {reservation.history && reservation.history.length > 0 && (
            <Card>
              <Copy>Historial</Copy>
              {reservation.history.map((h) => (
                <Copy key={`${h.changed_at}-${h.to_status}`} muted>{dateLabel(h.changed_at)} · {h.from_status ?? "—"} → {h.to_status}</Copy>
              ))}
            </Card>
          )}
          {/* The venue cannot cancel a confirmed reservation (409 RESERVATION_CONFIRMED); marketplace.admin still can. */}
          {(reservation.status === "HOLD" || (reservation.status === "CONFIRMED" && (mine || can("marketplace.admin")))) && (
            <Card>
              <Field label="Motivo de cancelación (opcional)" value={reason} onChangeText={setReason} />
              <Button title={confirm ? "Confirmar cancelación de la reserva" : "Cancelar reserva"} secondary danger disabled={action.busy}
                onPress={() => (confirm ? void cancel() : setConfirm(true))} />
              {reservation.status === "CONFIRMED" && <Copy muted>El pago simulado aprobado se marca como reembolsado.</Copy>}
            </Card>
          )}
          {venueSide && reservation.status === "CONFIRMED" && !can("marketplace.admin") && (
            <Copy muted>Una reserva confirmada solo la puede cancelar el cliente.</Copy>
          )}
        </>
      )}
    </Page>
  );
}
