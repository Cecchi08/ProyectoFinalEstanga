import { useEffect, useState } from "react";
import { AppState, Platform, Share, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useResource } from "../../hooks/useResource";
import type { Ticket } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Page,
  Pager,
  ResourceState,
  colors,
  dateLabel,
  radius,
  statusLabel,
  styles,
  useAction,
  useBento,
} from "../../components/ui";
import { subscribeTicketUpdates } from "./ticketEvents";

// Construye la URL pública/interna directa a una entrada específica para compartirla.
export function ticketShareUrl(ticketId: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/tickets/${ticketId}`;
  }
  return Linking.createURL(`/tickets/${ticketId}`);
}

// Comparte el enlace directo a la entrada usando Share nativo o Web Share / portapapeles en web.
async function shareTicketLink(ticket: Ticket, onShared: (msg: string) => void) {
  const url = ticketShareUrl(ticket.id);
  const summary = `${ticket.concert_name} (${ticket.ticket_type_name})`;
  if (Platform.OS !== "web") {
    await Share.share({
      title: ticket.concert_name,
      message: `${summary}\n${url}`,
      url,
    });
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: ticket.concert_name, text: summary, url });
      onShared(`Enlace compartido: ${url}`);
      return;
    } catch (err) {
      // Si la persona canceló el selector nativo del navegador, no copiamos ni mostramos error.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    onShared(`Enlace de entrada copiado: ${url}`);
    return;
  }
  onShared(`Enlace de tu entrada: ${url}`);
}

// Tarjeta reutilizable de pase digital con QR y botón de compartir link.
function TicketPassCard({
  ticket,
  width,
  mobile,
  onShare,
  onOpen,
  busy,
}: {
  ticket: Ticket;
  width: number;
  mobile: boolean;
  onShare(): void;
  onOpen?: () => void;
  busy?: boolean;
}) {
  return (
    <Card variant="featured">
      <View
        style={{
          flexDirection: mobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: mobile ? "stretch" : "center",
          gap: 18,
        }}
      >
        {/* Información principal del concierto y tipo de entrada */}
        <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
          {/* Indicador visual de pase activo vs inactivo */}
          <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: radius.pill,
                backgroundColor:
                  ticket.status === "VALID" && ticket.concert_status === "PUBLISHED"
                    ? colors.success
                    : colors.borderStrong,
              }}
            />
            <Text style={[styles.label, { color: colors.accent }]}>PASE DE ACCESO</Text>
          </View>
          <Text style={styles.heading}>{ticket.concert_name}</Text>
          <Copy muted>
            {dateLabel(ticket.start_datetime)} · {ticket.venue_name}
          </Copy>
          {ticket.venue_address ? <Copy muted>{ticket.venue_address}</Copy> : null}
          <View
            style={{
              marginTop: 4,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Copy strong>
              {ticket.ticket_type_name} · {statusLabel(ticket.status)}
            </Copy>
          </View>
          {/* Botones para compartir el link directo de esta entrada o abrir su detalle */}
          <View style={[styles.row, { paddingTop: 4 }]}>
            <Button
              title="Compartir entrada"
              secondary
              disabled={busy}
              onPress={onShare}
            />
            {onOpen && (
              <Button
                title="Abrir entrada"
                secondary
                onPress={onOpen}
              />
            )}
          </View>
        </View>
        {/* Solo renderiza el QR si la entrada es VALID y el concierto está PUBLISHED */}
        {ticket.status === "VALID" &&
        ticket.concert_status === "PUBLISHED" ? (
          <View
            accessibilityLabel={`QR de entrada para ${ticket.concert_name} (${ticket.ticket_type_name})`}
            style={{
              backgroundColor: "#fff",
              padding: 18,
              alignSelf: "center",
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Generación visual del código QR en SVG a partir de ticket.qr_token */}
            <QRCode
              value={ticket.qr_token}
              size={Math.min(180, Math.max(120, width - 148))}
              quietZone={12}
            />
          </View>
        ) : (
          // Mensaje alternativo cuando la entrada fue usada, cancelada o el show no está publicado
          <View
            style={{
              padding: 14,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Copy muted>Esta entrada no está habilitada para ingresar.</Copy>
          </View>
        )}
      </View>
    </Card>
  );
}

// Pantalla de pases digitales: lista las entradas del usuario y renderiza su código QR.
export default function TicketsScreen() {
  const { width, mobile } = useBento();
  // Página actual de entradas paginadas.
  const [page, setPage] = useState(1);
  // Consulta GET /tickets al backend con paginación.
  const resource = useResource<Ticket[]>(`/tickets?page=${page}`);
  const shareAction = useAction();

  // Escuchar evento directo de validación en tiempo real (mismo cliente/sesión)
  useEffect(() => {
    return subscribeTicketUpdates(() => {
      void resource.reload();
    });
  }, [resource]);

  // Polling inteligente: solo cuando hay al menos una entrada con estado VALID
  // para reflejar la confirmación del servidor en tiempo real sin recarga manual
  const hasValidTickets = Boolean(
    resource.result?.data?.some((t) => t.status === "VALID")
  );

  useEffect(() => {
    if (!hasValidTickets) return;
    const interval = setInterval(() => {
      void resource.reload();
    }, 7000);
    return () => clearInterval(interval);
  }, [hasValidTickets, resource]);

  // Recarga automática al volver al foco / primer plano
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onFocus = () => void resource.reload();
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void resource.reload();
    });
    return () => sub.remove();
  }, [resource]);
  return (
    <Page
      eyebrow="VENTI · PASES DIGITALES"
      title="Tus entradas"
      subtitle="Cada QR corresponde a una entrada. Presentalo al ingresar o compartí su enlace."
      actions={
        <Button
          title="Actualizar entradas"
          secondary
          onPress={() => void resource.reload()}
        />
      }
    >
      <ActionFeedback action={shareAction} />
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((ticket) => (
          <View
            key={ticket.id}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 520,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
            }}
          >
            <TicketPassCard
              ticket={ticket}
              width={width}
              mobile={mobile}
              busy={shareAction.busy}
              onShare={() =>
                void shareAction.run(() =>
                  shareTicketLink(ticket, shareAction.setMessage),
                )
              }
              onOpen={() => router.push(`/tickets/${ticket.id}`)}
            />
          </View>
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}

// Vista de detalle de una entrada puntual (accesible desde el enlace compartido /tickets/:id).
export function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, mobile } = useBento();
  const resource = useResource<Ticket>(id ? `/tickets/${id}` : null);
  const shareAction = useAction();
  const ticket = resource.result?.data;

  return (
    <Page
      eyebrow="VENTI · PASE DIGITAL"
      title={ticket?.concert_name ?? "Detalle de entrada"}
      subtitle={ticket ? `${ticket.ticket_type_name} · ${statusLabel(ticket.status)}` : undefined}
      actions={
        <Button
          title="Volver a mis entradas"
          secondary
          onPress={() => router.push("/tickets")}
        />
      }
    >
      <ActionFeedback action={shareAction} />
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {ticket && (
        <TicketPassCard
          ticket={ticket}
          width={width}
          mobile={mobile}
          busy={shareAction.busy}
          onShare={() =>
            void shareAction.run(() =>
              shareTicketLink(ticket, shareAction.setMessage),
            )
          }
        />
      )}
    </Page>
  );
}
