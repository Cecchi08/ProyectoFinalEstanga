import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Purchase } from "../../types/api";
import { ActivityIndicator, Text, View } from "react-native";
import { useNotifications } from "../../contexts/NotificationsContext";
import {
  formatCardCvv,
  formatCardExpiry,
  formatCardNumber,
  validateSimulatedCard,
} from "../concerts/purchaseAttempt";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  HoldIndicator,
  Notice,
  Page,
  Pager,
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
  useHoldSync,
} from "../../components/ui";

const refundLabel = (purchase: Purchase) =>
  purchase.refund_status === "REFUNDED" ? " · Reembolsada" : "";

export default function PurchasesScreen() {
  const [page, setPage] = useState(1);
  const { mobile } = useBento();
  const resource = useResource<Purchase[]>(`/purchases/me?page=${page}`);
  const hasPending = Boolean(resource.result?.data.some((p) => p.status === "PENDING"));
  useHoldSync(hasPending, () => void resource.reload());
  return (
    <Page
      eyebrow="VENTI · ÓRDENES Y ENTRADAS"
      title="Mis compras"
      subtitle="Historial de compras de entradas, estado de emisión y reembolsos."
    >
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
        skeleton="list"
      />
      <BentoGrid>
        {resource.result?.data.map((purchase) => (
          <View
            key={purchase.id}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 360,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
            }}
          >
            <Card style={{ flexGrow: 1, justifyContent: "space-between" }}>
              <View style={{ gap: 6 }}>
                <Copy strong>
                  {purchase.concert_name ?? "Compra de entradas"}
                </Copy>
                {purchase.artist_name || purchase.venue_name ? (
                  <Copy muted>
                    {[purchase.artist_name, purchase.venue_name].filter(Boolean).join(" · ")}
                  </Copy>
                ) : null}
                <Copy muted>
                  Estado: {statusLabel(purchase.status)}
                  {refundLabel(purchase)}
                  {purchase.public_code ? ` · Ref. ${purchase.public_code}` : ""}
                </Copy>
                <Copy muted>
                  {dateLabel(purchase.created_at)} · {money(purchase.total)}
                </Copy>
                {purchase.status === "PENDING" && purchase.expires_at && (
                  <HoldIndicator
                    expiresAt={purchase.expires_at}
                    active={purchase.status === "PENDING"}
                    onExpire={() => void resource.reload()}
                  />
                )}
              </View>
              <Button
                title="Ver detalle de compra"
                secondary
                onPress={() => router.push(`/purchases/${purchase.id}`)}
              />
            </Card>
          </View>
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}

export function PurchaseDetail() {
  const notifications = useNotifications();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mobile } = useBento();
  const resource = useResource<Purchase>(`/purchases/${id}`);
  const action = useAction();
  const [cancel, setCancel] = useState(false);
  const [notice, setNotice] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const purchase = resource.result?.data;
  useHoldSync(purchase?.status === "PENDING", () => void resource.reload());

  const totalTickets =
    purchase?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;

  const payPending = () =>
    action.run(async () => {
      const cardError = validateSimulatedCard({ cardNumber, expiry, cvv });
      if (cardError) {
        throw new Error(cardError);
      }

      // Simulación académica del procesamiento de pago (~1 segundo) sin enviar datos sensibles.
      await new Promise((resolve) => setTimeout(resolve, 950));

      try {
        const { data } = await api.request<Purchase & { notice?: string }>(
          `/purchases/${id}/confirm`,
          {
            method: "POST",
            body: { outcome: "APPROVED" },
          },
        );
        setCardNumber("");
        setExpiry("");
        setCvv("");
        setCancel(false);
        setNotice(data.notice ?? "");
        await notifications.reload();
      } finally {
        await resource.reload();
      }
      action.setMessage("¡Compra realizada con éxito! Tus entradas y códigos QR ya están disponibles.");
    });

  const cancelPurchase = () =>
    action.run(async () => {
      try {
        const { data } = await api.request<Purchase & { notice?: string }>(
          `/purchases/${id}/cancel`,
          {
            method: "POST",
            body: {},
          },
        );
        setCancel(false);
        setNotice(data.notice ?? "");
        await notifications.reload();
      } finally {
        await resource.reload();
      }
      action.setMessage("Compra cancelada.");
    });

  return (
    <Page
      eyebrow="VENTI · DETALLE DE COMPRA"
      title={purchase?.concert_name ?? "Detalle de compra"}
      subtitle={
        purchase?.public_code
          ? `Referencia de operación ${purchase.public_code}`
          : "Resumen de entradas y comprobante digital"
      }
      actions={<Button title="Mis compras" secondary onPress={() => router.push("/purchases")} />}
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {purchase && (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View
            style={{
              flexGrow: 2,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 500,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 14,
            }}
          >
            <Card variant="featured">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <Text style={[styles.label, { color: colors.accent }]}>ESTADO DE LA COMPRA</Text>
                <Copy strong>{statusLabel(purchase.status)}</Copy>
              </View>

              {purchase.status === "CONFIRMED" && (
                <View
                  style={{
                    gap: 6,
                    padding: 14,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    borderWidth: 1,
                    borderColor: colors.accentBorder,
                  }}
                >
                  <Copy strong>¡Compra realizada con éxito!</Copy>
                  <Copy>Concierto: {purchase.concert_name ?? "Show en vivo"}</Copy>
                  <Copy>Cantidad de entradas: {totalTickets}</Copy>
                  <Copy strong>Monto total: {money(purchase.total)}</Copy>
                  <Copy muted>Fecha de operación: {dateLabel(purchase.created_at)}</Copy>
                </View>
              )}

              <View style={{ gap: 8, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
                {purchase.concert_name ? (
                  <Copy strong>Concierto: {purchase.concert_name}</Copy>
                ) : null}
                {purchase.venue_name ? (
                  <Copy muted>Espacio: {purchase.venue_name}</Copy>
                ) : null}
                {purchase.start_datetime ? (
                  <Copy muted>Fecha del show: {dateLabel(purchase.start_datetime)}</Copy>
                ) : null}
                <Copy muted>Cantidad total de entradas: {totalTickets}</Copy>
                {purchase.items?.map((item) => (
                  <Copy key={item.id}>
                    {item.quantity} × {item.ticket_type_name} · {money(item.unit_price)}
                  </Copy>
                ))}
              </View>

              <Text style={[styles.heading, { color: colors.accent }]}>Total: {money(purchase.total)}</Text>
              {purchase.expires_at && purchase.status === "PENDING" && (
                <HoldIndicator
                  expiresAt={purchase.expires_at}
                  active={purchase.status === "PENDING"}
                  onExpire={() => void resource.reload()}
                />
              )}

              {purchase.status === "PENDING" && (
                <View
                  style={{
                    gap: 12,
                    paddingTop: 8,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <SectionHeader
                    title="Pago con tarjeta"
                    subtitle="Completá los datos de tu tarjeta para confirmar la compra y generar tus códigos QR."
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
                  {action.busy && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <ActivityIndicator color={colors.accent} size="small" />
                      <Copy muted>Procesando pago y emitiendo tus entradas...</Copy>
                    </View>
                  )}
                  <View style={styles.row}>
                    <Button
                      title={action.busy ? "Procesando pago..." : "Pagar"}
                      disabled={action.busy}
                      onPress={() => void payPending()}
                    />
                  </View>
                </View>
              )}

              <ActionFeedback action={action} />
              <Notice message={notice} />

              {purchase.status === "CONFIRMED" && (
                <Button
                  title="Ver mis entradas y códigos QR"
                  onPress={() => router.push("/tickets")}
                />
              )}
              {["PENDING", "CONFIRMED"].includes(purchase.status) && (
                <Button
                  title={cancel ? "Sí, cancelar la compra" : "Cancelar compra"}
                  danger
                  secondary={!cancel}
                  disabled={action.busy}
                  onPress={() =>
                    cancel ? void cancelPurchase() : setCancel(true)
                  }
                />
              )}
              {purchase.status === "CONFIRMED" && (
                <Copy muted>Si cancelás, el pago simulado se marca como reembolsado.</Copy>
              )}
              <Copy muted>
                Simulación académica: los datos de la tarjeta nunca se almacenan ni se envían a la base de datos.
              </Copy>
            </Card>
          </View>
          {(purchase.payments?.length ?? 0) > 0 && (
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: mobile ? "auto" : 360,
                width: mobile ? "100%" : undefined,
                maxWidth: "100%",
              }}
            >
              <Card>
                <SectionHeader title={`Comprobantes de pago${refundLabel(purchase)}`} />
                {purchase.refunded_at && <Copy muted>Reembolso: {dateLabel(purchase.refunded_at)}</Copy>}
                {purchase.payments?.map((payment) => (
                  <Copy key={payment.id} muted>
                    {payment.simulated_reference} · {statusLabel(payment.status)} · {money(payment.amount)} · {dateLabel(payment.processed_at)}
                    {payment.refunded_at ? ` · Reembolsado ${dateLabel(payment.refunded_at)}` : ""}
                  </Copy>
                ))}
              </Card>
            </View>
          )}
        </BentoGrid>
      )}
    </Page>
  );
}
