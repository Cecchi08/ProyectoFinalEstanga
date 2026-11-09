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
              flexBasis: mobile ? "100%" : 540,
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
                subBadge={concert.genres.map((g) => g.name).join(" · ")}
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
              flexBasis: mobile ? "100%" : 380,
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
                    backgroundColor: colors.primarySoft,
                    borderWidth: 1,
                    borderColor: colors.primary,
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
                </Card>
                {concert.ticket_types.map((type) => (
                  <Card key={type.id}>
                    <Copy strong>
                      {type.name} · {money(type.price)}
                    </Copy>
                    <Copy muted>
                      {type.max_per_purchase
                        ? `Máximo por compra: ${type.max_per_purchase}`
                        : "Disponibilidad inmediata."}
                    </Copy>
                    {type.sale_end && (
                      <Copy muted>Venta hasta {dateLabel(type.sale_end)}</Copy>
                    )}
                    <Field
                      label={`Cantidad ${type.name}`}
                      keyboardType="number-pad"
                      value={quantities[type.id] ?? ""}
                      placeholder="0"
                      onChangeText={(value) =>
                        setQuantities({ ...quantities, [type.id]: value })
                      }
                    />
                  </Card>
                ))}
                {!concert.ticket_types.length && (
                  <Card variant="subtle">
                    <Copy muted>No hay entradas disponibles.</Copy>
                  </Card>
                )}

                <Card variant="featured">
                  <SectionHeader
                    title="Pago con tarjeta"
                    subtitle={
                      totalSelectedTickets > 0
                        ? `${totalSelectedTickets} ${totalSelectedTickets === 1 ? "entrada seleccionada" : "entradas seleccionadas"} · Total a pagar: ${money(estimatedTotal)}`
                        : "Seleccioná tus entradas y completá los datos de tu tarjeta"
                    }
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
              </>
            )}
          </View>
        </BentoGrid>
      )}
    </Page>
  );
}
