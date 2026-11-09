import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationsContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { primaryRole, type ArtistProposal } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  MusicalCover,
  Page,
  ResourceState,
  SectionHeader,
  colors,
  dateLabel,
  flowLabel,
  money,
  statusLabel,
  styles,
  useAction,
  useBento,
} from "../../components/ui";

// Explains a closed proposal; actions are only offered while it is PENDING (the API enforces the same rule).
const CLOSED_NOTE: Partial<Record<ArtistProposal["status"], string>> = {
  ACCEPTED: "La contratación quedó confirmada. Recordá que no implica una reserva del espacio: esa se gestiona aparte.",
  REJECTED: "La propuesta fue rechazada por la parte destinataria.",
  CANCELLED: "Quien envió la propuesta la canceló antes de recibir respuesta.",
  EXPIRED: "La fecha propuesta ya pasó sin respuesta, por lo que la propuesta venció y no admite acciones.",
};

// Who has to answer, in plain words.
const awaiting = (proposal: ArtistProposal) =>
  proposal.flow_type === "ARTIST_TO_VENUE"
    ? `Espera respuesta de ${proposal.establishment_name ?? "el espacio físico"}.`
    : `Espera respuesta de ${proposal.artist_name}.`;

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={{ gap: 2, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <Copy size="label" color={colors.muted}>{label.toUpperCase()}</Copy>
      <Copy>{String(value)}</Copy>
    </View>
  );
}

// GET /proposals/:id — the API checks that the viewer is the sender, an artist member,
// a member of the venue's organization or an admin (403 otherwise, 404 when it no longer exists).
export default function ProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const badge = useNotifications();
  const { mobile } = useBento();
  const resource = useResource<ArtistProposal>(`/proposals/${id}`);
  const proposal = resource.result?.data;
  const action = useAction();
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const role = primaryRole(auth.roles);
  const back =
    role === "VENUE" ? { path: "/marketplace/manage", label: "Volver a mi espacio" }
      : role === "ORGANIZADOR" ? { path: "/organizer", label: "Volver a mis conciertos" }
        : role === "ARTISTA" ? { path: "/artists", label: "Volver al panel de artista" }
          : { path: "/notifications", label: "Volver a notificaciones" };

  const decide = (operation: "accept" | "reject" | "cancel") =>
    action.run(async () => {
      if (operation === "reject" && reason.trim().length < 3)
        throw new Error("Indicá un motivo para el rechazo (mínimo 3 caracteres).");
      await api.request(`/proposals/${id}/${operation}`, {
        method: "POST",
        body: reason.trim() ? { reason: reason.trim() } : {},
      });
      setReason("");
      setConfirmCancel(false);
      await Promise.all([resource.reload(), badge.reload()]);
      action.setMessage(
        operation === "accept" ? "Propuesta aceptada: la contratación quedó confirmada."
          : operation === "reject" ? "Propuesta rechazada. Se notificó a quien la envió."
            : "Propuesta cancelada.",
      );
    });

  const place = proposal ? [proposal.establishment_name, proposal.venue_name].filter(Boolean).join(" · ") : "";
  const schedule = proposal
    ? proposal.proposed_end_date
      ? `${dateLabel(proposal.proposed_date)} → ${dateLabel(proposal.proposed_end_date)}`
      : dateLabel(proposal.proposed_date)
    : "";

  return (
    <Page
      eyebrow="VENTI · DETALLE DE PROPUESTA"
      title={proposal ? proposal.event_title : "Propuesta"}
      subtitle={proposal ? `${flowLabel(proposal.flow_type)} · ${statusLabel(proposal.status)}` : undefined}
      actions={<Button title={back.label} secondary onPress={() => router.push(back.path)} />}
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {proposal && (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View style={{ flexGrow: 2, flexShrink: 1, minWidth: 0, flexBasis: mobile ? "auto" : 480, width: mobile ? "100%" : undefined, maxWidth: "100%", gap: 16 }}>
            <Card variant="featured">
              <MusicalCover uri={proposal.artist_image_url} alt={proposal.artist_name} kind="artist" height={180} badge={statusLabel(proposal.status)} />
              <Copy size="heading" weight="700">{proposal.artist_name}</Copy>
              <Copy muted>{place || "Sin espacio asociado"}{proposal.city_name ? ` · ${proposal.city_name}` : ""}</Copy>
              <Copy strong>{schedule}</Copy>
              {proposal.offered_amount != null && (
                <Copy strong color={colors.accent}>Monto ofrecido: {money(proposal.offered_amount)}</Copy>
              )}
              {proposal.message && <Copy>{proposal.message}</Copy>}
            </Card>
            <Card>
              <SectionHeader title="Condiciones de la propuesta" />
              <Row label="Descripción del evento" value={proposal.event_description} />
              <Row label="Formato o género" value={proposal.genre_or_format} />
              <Row label="Público estimado" value={proposal.expected_attendance} />
              <Row label="Condiciones económicas" value={proposal.economic_terms} />
              <Row label="Condiciones del espacio" value={proposal.space_conditions} />
              <Row label="Requerimientos técnicos" value={proposal.technical_requirements} />
              <Row label="Concierto vinculado" value={proposal.concert_name} />
              <Row label="Capacidad de la sala" value={proposal.venue_capacity ? `${proposal.venue_capacity} personas` : null} />
            </Card>
          </View>

          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: mobile ? "auto" : 340, width: mobile ? "100%" : undefined, maxWidth: "100%", gap: 16 }}>
            <Card>
              <SectionHeader title="Estado" />
              <View style={styles.badge}>
                <Copy size="label" color={colors.accentText}>{statusLabel(proposal.status).toUpperCase()}</Copy>
              </View>
              {proposal.status === "PENDING" ? <Copy muted>{awaiting(proposal)}</Copy> : <Copy muted>{CLOSED_NOTE[proposal.status]}</Copy>}
              <Row label="Enviada por" value={proposal.sender_name} />
              <Row label="Recibida" value={dateLabel(proposal.created_at)} />
              <Row label="Respondida" value={proposal.responded_at ? dateLabel(proposal.responded_at) : null} />
              <Row label="Motivo o respuesta" value={proposal.rejection_reason} />
              {(proposal.artist_contact_email || proposal.artist_phone) && proposal.status === "ACCEPTED" && (
                <Row label="Contacto del artista" value={[proposal.artist_contact_email, proposal.artist_phone].filter(Boolean).join(" · ")} />
              )}
              {proposal.status === "ACCEPTED" && proposal.sender_email && (
                <Row label="Contacto de quien propuso" value={proposal.sender_email} />
              )}
            </Card>

            {proposal.status === "PENDING" && proposal.can_respond && (
              <Card variant="featured">
                <SectionHeader title="Tu respuesta" subtitle="Al responder se notifica automáticamente a quien envió la propuesta." />
                <Field label="Motivo o comentario (obligatorio para rechazar)" multiline value={reason} onChangeText={setReason} />
                <View style={styles.row}>
                  <Button title="Aceptar propuesta" disabled={action.busy} onPress={() => void decide("accept")} />
                  <Button title="Rechazar propuesta" secondary danger disabled={action.busy} onPress={() => void decide("reject")} />
                </View>
              </Card>
            )}
            {proposal.status === "PENDING" && proposal.can_cancel && (
              <Card>
                <SectionHeader title="Cancelar propuesta" subtitle="Podés retirarla mientras siga pendiente." />
                <Button
                  title={confirmCancel ? "Sí, cancelar la propuesta" : "Cancelar propuesta"}
                  secondary={!confirmCancel}
                  danger
                  disabled={action.busy}
                  onPress={() => (confirmCancel ? void decide("cancel") : setConfirmCancel(true))}
                />
              </Card>
            )}
          </View>
        </BentoGrid>
      )}
    </Page>
  );
}

