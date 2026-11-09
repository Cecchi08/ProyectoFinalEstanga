import { useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  formatCardCvv,
  formatCardExpiry,
  formatCardNumber,
  purchaseAttempt,
  validateSimulatedCard,
  type PurchaseAttempt,
} from "./purchaseAttempt";
import { api } from "../../services/api";
import { getServerNow } from "../../services/http";
import { useResource } from "../../hooks/useResource";
import { useNotifications } from "../../contexts/NotificationsContext";
import type { Concert, Purchase } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  MusicalCover,
  Page,
  QuantityStepper,
  ResourceState,
  SectionHeader,
  colors,
  dateLabel,
  money,
  radius,
  statusLabel,
  styles,
  useAction,
  useBento,
} from "../../components/ui";

// The location is optional while the concert is a draft.
export const place = (concert: Pick<Concert, "venue_name" | "city_name" | "province_name">) =>
  [concert.venue_name, [concert.city_name, concert.province_name].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Lugar a confirmar";

// Linked artist profiles in billing order; a concert without links only has the billing text.
export const lineup = (concert: Pick<Concert, "artists" | "artist_name">) =>
  concert.artists?.length ? concert.artists.map((artist) => artist.name).join(" · ") : concert.artist_name;

export default function ConcertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<Concert>(`/concerts/${id}`);
  const notifications = useNotifications();
  const action = useAction();
  const { desktop, mobile } = useBento();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [confirmedPurchase, setConfirmedPurchase] = useState<{
    concertName: string;
    totalTickets: number;
    totalAmount: number | string;
    purchasedAt: string;
    publicCode?: string;
  } | null>(null);
  const attempt = useRef<PurchaseAttempt | null>(null);
  const concert = resource.result?.data;

  const selectedItems = Object.entries(quantities)
    .filter(([, q]) => q !== "" && Number(q) !== 0)
    .map(([ticketTypeId, q]) => ({ ticketTypeId, quantity: Number(q) }));

  const estimatedTotal = concert
    ? selectedItems.reduce((acc, item) => {
      const found = concert.ticket_types.find((t) => String(t.id) === String(item.ticketTypeId));
      const unitPrice = found ? Number(found.price) : 0;
      return acc + (Number.isFinite(unitPrice) && item.quantity > 0 ? unitPrice * item.quantity : 0);
    }, 0)
    : 0;

  const totalSelectedTickets = selectedItems.reduce(
    (acc, item) => acc + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0),
    0,
  );

  const pay = () =>
    action.run(async () => {
      if (!concert) return;
      if (
        !selectedItems.length ||
        selectedItems.some(
          (item) => !Number.isInteger(item.quantity) || item.quantity < 1,
        )
      ) {
        throw new Error("Seleccioná al menos una entrada con cantidad entera positiva.");
      }

      const cardError = validateSimulatedCard({ cardNumber, expiry, cvv });
      if (cardError) {
        throw new Error(cardError);
      }

      // Simulación académica de procesamiento bancario (~1 segundo). Nunca se envían datos de tarjeta al backend.
      await new Promise((resolve) => setTimeout(resolve, 950));

      // Mismo carrito = misma clave: un reintento tras un timeout devuelve la compra original, no una nueva.
      attempt.current = purchaseAttempt(attempt.current, selectedItems, () => Crypto.randomUUID());
      const { data: created } = await api.request<Purchase>("/purchases", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: { concertId: id, items: selectedItems },
      });

      const { data: confirmed } = await api.request<Purchase>(`/purchases/${created.id}/confirm`, {
        method: "POST",
        body: { outcome: "APPROVED" },
      });

      // Limpiamos los datos sensibles del formulario inmediatamente después de aprobar.
      setCardNumber("");
      setExpiry("");
      setCvv("");
      await notifications.reload();

      const ticketCount =
        confirmed.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ||
        totalSelectedTickets;

      setConfirmedPurchase({
        concertName: concert.name,
        totalTickets: ticketCount,
        totalAmount: confirmed.total ?? estimatedTotal,
        purchasedAt: confirmed.created_at ?? new Date().toISOString(),
        publicCode: confirmed.public_code,
      });
    });

  return (
    <Page
      eyebrow="VENTI · SHOW EN VIVO"
      title={concert?.name ?? "Concierto"}
      subtitle={concert ? `${dateLabel(concert.start_datetime)} · ${place(concert)}` : undefined}
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {concert && (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View
            style={{
              flexGrow: 2,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 540,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 16,
            }}
          >
            <Card variant="featured">
              <MusicalCover
                uri={concert.image_url}
                alt={concert.name}
                kind="concert"
                height={desktop ? 270 : 210}
                badge={statusLabel(concert.status)}
                subBadge={
                  concert.genres.length > 2
                    ? `${concert.genres.slice(0, 2).map((g) => g.name).join(" · ")} +${concert.genres.length - 2}`
                    : concert.genres.map((g) => g.name).join(" · ")
                }
              />
              <View style={{ gap: 8 }}>
                <Copy strong>{dateLabel(concert.start_datetime)}</Copy>
                <Copy strong>{place(concert)}</Copy>
                {concert.address_line && <Copy muted>{concert.address_line}</Copy>}
                {concert.description ? <Copy>{concert.description}</Copy> : null}
              </View>
              <View
                style={{
                  gap: 6,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Copy muted>Artistas: {lineup(concert)}</Copy>
                {concert.genres.length > 0 && (
                  <Copy muted>
                    Géneros: {concert.genres.map((g) => g.name).join(", ")}
                  </Copy>
                )}
                {concert.price_from != null && (
                  <Copy muted>Entradas desde {money(concert.price_from)}</Copy>
                )}
              </View>
            </Card>
            {concert.artists.some((artist) => artist.id) && (
              <Card>
                <SectionHeader title="En el cartel" subtitle="Perfiles oficiales vinculados a esta fecha" />
                <View style={styles.row}>
                  {concert.artists.map((artist, index) =>
                    artist.id ? (
                      <Button
                        key={artist.id}
                        title={`${index === 0 ? "Principal: " : ""}${artist.name}`}
                        secondary
                        onPress={() => router.push(`/artist/${artist.id}`)}
                      />
                    ) : null,
                  )}
                </View>
              </Card>
            )}
          </View>

          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 380,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 14,
            }}
          >
            {confirmedPurchase ? (
              <Card variant="featured">
                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    alignSelf: "flex-start",
                    backgroundColor: colors.accentSoft,
                    borderWidth: 1,
                    borderColor: colors.accentBorder,
                  }}
                >
                  <Text style={[styles.label, { color: colors.accent }]}>COMPRA CONFIRMADA</Text>
                </View>
                <SectionHeader
                  title="¡Compra realizada con éxito!"
                  subtitle="Tus entradas digitales y códigos QR ya fueron emitidos."
                />
                <View
                  style={{
                    gap: 8,
                    padding: 14,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>Concierto: {confirmedPurchase.concertName}</Copy>
                  <Copy>Cantidad de entradas: {confirmedPurchase.totalTickets}</Copy>
                  <Copy strong>Monto total: {money(confirmedPurchase.totalAmount)}</Copy>
                  <Copy muted>Fecha de compra: {dateLabel(confirmedPurchase.purchasedAt)}</Copy>
                  {confirmedPurchase.publicCode ? (
                    <Copy muted>Código de referencia: {confirmedPurchase.publicCode}</Copy>
                  ) : null}
                </View>
                <View style={styles.row}>
                  <Button
                    title="Ver mis entradas y códigos QR"
                    onPress={() => router.push("/tickets")}
                  />
                  <Button
                    title="Ver historial de compras"
                    secondary
                    onPress={() => router.push("/purchases")}
                  />
                </View>
              </Card>
            ) : (
              <>
                <Card variant="subtle">
                  <SectionHeader
                    title="Elegí tus entradas"
                    subtitle="Seleccioná la cantidad y completá el pago para emitir tus códigos QR al instante."
                  />
                  <Copy strong={totalSelectedTickets > 0} muted={totalSelectedTickets === 0}>
                    {totalSelectedTickets > 0
                      ? `Resumen: ${totalSelectedTickets} ${totalSelectedTickets === 1 ? "entrada seleccionada" : "entradas seleccionadas"} · Total ${money(estimatedTotal)}`
                      : "Seleccioná al menos 1 entrada para habilitar el pago."}
                  </Copy>
                </Card>
                {concert.ticket_types.map((type) => {
                  const nowMs = getServerNow();
                  const availableStock =
                    type.stock_available ??
                    Math.max(0, Number(type.stock_total ?? 0) - Number(type.quantity_sold ?? 0));
                  const soldOut = availableStock <= 0;
                  const beforeStart = type.sale_start ? Date.parse(type.sale_start) > nowMs : false;
                  const afterEnd = type.sale_end ? Date.parse(type.sale_end) < nowMs : false;
                  const outsideWindow = beforeStart || afterEnd;
                  const maxAllowed = Math.max(
                    0,
                    Math.min(
                      availableStock,
                      type.max_per_purchase != null && type.max_per_purchase > 0
                        ? type.max_per_purchase
                        : availableStock,
                    ),
                  );
                  return (
                    <Card key={type.id}>
                      <View style={styles.between}>
                        <Copy strong>
                          {type.name} · {money(type.price)}
                        </Copy>
                        {soldOut ? (
                          <View style={[styles.badgeMuted, { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft }]}>
                            <Copy size="small" color={colors.dangerText} weight="700">
                              Agotado
                            </Copy>
                          </View>
                        ) : outsideWindow ? (
                          <View style={styles.badgeMuted}>
                            <Copy size="small" muted weight="700">
                              Fuera de ventana de venta
                            </Copy>
                          </View>
                        ) : null}
                      </View>
                      <Copy muted>
                        {soldOut
                          ? "Sin cupo disponible."
                          : outsideWindow
                            ? "La venta para este tipo de entrada no está activa en este momento."
                            : type.max_per_purchase
                              ? `Disponibles: ${availableStock} · Máximo por compra: ${type.max_per_purchase}`
                              : `Disponibles: ${availableStock} · Disponibilidad inmediata.`}
                      </Copy>
                      {type.sale_start && (
                        <Copy muted>Venta desde {dateLabel(type.sale_start)}</Copy>
                      )}
                      {type.sale_end && (
                        <Copy muted>Venta hasta {dateLabel(type.sale_end)}</Copy>
                      )}
                      <QuantityStepper
                        label={`Cantidad ${type.name}`}
                        value={Number(quantities[type.id] || 0)}
                        min={0}
                        max={maxAllowed}
                        disabled={soldOut || outsideWindow || concert.status !== "PUBLISHED"}
                        onChange={(next) =>
                          setQuantities({ ...quantities, [type.id]: next > 0 ? String(next) : "" })
                        }
                      />
                    </Card>
                  );
                })}
                {!concert.ticket_types.length && (
                  <Card variant="subtle">
                    <Copy muted>No hay entradas disponibles.</Copy>
                  </Card>
                )}

                {totalSelectedTickets > 0 && (
                  <Card variant="featured">
                    <SectionHeader
                      title="Pago con tarjeta"
                      subtitle={`${totalSelectedTickets} ${totalSelectedTickets === 1 ? "entrada seleccionada" : "entradas seleccionadas"} · Total a pagar: ${money(estimatedTotal)}`}
                    />
                    <Field
                      label="Número de tarjeta"
                      keyboardType="number-pad"
                      placeholder="4509 1234 5678 9010"
                      value={cardNumber}
                      onChangeText={(v) => setCardNumber(formatCardNumber(v))}
                    />
                    <View style={styles.row}>
                      <View style={{ flex: 1, minWidth: 140 }}>
                        <Field
                          label="Fecha de vencimiento (MM/AA)"
                          keyboardType="number-pad"
                          placeholder="08/28"
                          value={expiry}
                          onChangeText={(v) => setExpiry(formatCardExpiry(v))}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 120 }}>
                        <Field
                          label="Código de seguridad (CVV)"
                          keyboardType="number-pad"
                          placeholder="123"
                          secureTextEntry
                          value={cvv}
                          onChangeText={(v) => setCvv(formatCardCvv(v))}
                        />
                      </View>
                    </View>
                    <ActionFeedback action={action} />
                    {action.busy && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                        <ActivityIndicator color={colors.accent} size="small" />
                        <Copy muted>Procesando pago y generando tus entradas...</Copy>
                      </View>
                    )}
                    <View style={styles.row}>
                      <Button
                        title={action.busy ? "Procesando pago..." : "Pagar"}
                        disabled={
                          action.busy ||
                          concert.status !== "PUBLISHED" ||
                          !concert.ticket_types.length
                        }
                        onPress={() => void pay()}
                      />
                    </View>
                    <Copy muted>
                      Simulación académica: los datos de la tarjeta se validan localmente y nunca se almacenan ni envían al servidor.
                    </Copy>
                  </Card>
                )}
              </>
            )}
          </View>
        </BentoGrid>
      )}
    </Page>
  );
}
