import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Purchase } from "../../types/api";
import { View } from "react-native";
import { useNotifications } from '../../contexts/NotificationsContext';
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Notice,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  money,
  styles,
  useAction,
} from "../../components/ui";
const refundLabel = (purchase: Purchase) =>
  purchase.refund_status === "REFUNDED" ? " · reembolsada" : "";
export default function PurchasesScreen() {
  const [page, setPage] = useState(1);
  const resource = useResource<Purchase[]>(`/purchases/me?page=${page}`);
  return (
    <Page title="Mis compras">
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((purchase) => (
        <Card key={purchase.id}>
          <Copy>
            Compra #{purchase.id} · {purchase.status}
            {refundLabel(purchase)}
          </Copy>
          <Copy>
            {dateLabel(purchase.created_at)} · {money(purchase.total)}
          </Copy>
          <Button
            title={`Ver compra ${purchase.id}`}
            onPress={() => router.push(`/purchases/${purchase.id}`)}
          />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
export function PurchaseDetail() {
  const notifications = useNotifications();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<Purchase>(`/purchases/${id}`);
  const action = useAction();
  const [cancel, setCancel] = useState(false);
  const [notice, setNotice] = useState("");
  const purchase = resource.result?.data;
  // confirm is the simulated payment: APPROVED confirms the purchase, REJECTED is recorded and it stays PENDING.
  const transition = (operation: "confirm" | "cancel", outcome?: "APPROVED" | "REJECTED") =>
    action.run(async () => {
      try {
        const { data } = await api.request<Purchase & { notice?: string }>(`/purchases/${id}/${operation}`, {
          method: "POST",
          body: outcome ? { outcome } : {},
        });
        setCancel(false);
        setNotice(data.notice ?? "");
        await notifications.reload();
      } finally {
        // An expired reservation can change state even when confirmation fails.
        await resource.reload();
      }
      action.setMessage(
        operation === "cancel"
          ? "Compra cancelada."
          : outcome === "REJECTED"
            ? "Pago simulado rechazado: la compra sigue pendiente."
            : "Pago aprobado y compra confirmada. Tus QR están en Entradas.",
      );
    });
  return (
    <Page title={`Compra #${id}`}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {purchase && (
        <Card>
          <Copy>{purchase.status}</Copy>
          {purchase.items?.map((item) => (
            <Copy key={item.id}>
              {item.quantity} × {item.ticket_type_name} ·{" "}
              {money(item.unit_price)}
            </Copy>
          ))}
          <Copy>Total: {money(purchase.total)}</Copy>
          {purchase.expires_at &&
            purchase.status === "PENDING" && (
              <Copy>Vence: {dateLabel(purchase.expires_at)}</Copy>
            )}
          <ActionFeedback action={action} />
          <Notice message={notice} />
          {purchase.status === "PENDING" && (
            <View style={styles.row}>
              <Button
                title="Simular pago aprobado"
                disabled={action.busy}
                onPress={() => void transition("confirm", "APPROVED")}
              />
              <Button
                title="Simular pago rechazado"
                secondary
                disabled={action.busy}
                onPress={() => void transition("confirm", "REJECTED")}
              />
            </View>
          )}
          {purchase.status === "CONFIRMED" && (
            <Button
              title="Ver mis entradas QR"
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
                cancel ? void transition("cancel") : setCancel(true)
              }
            />
          )}
          {purchase.status === "CONFIRMED" && (
            <Copy muted>Si cancelás, el pago simulado se marca como reembolsado.</Copy>
          )}
          <Copy muted>
            Pago simulado: no se cobra dinero ni se piden datos de tarjeta.
          </Copy>
        </Card>
      )}
      {purchase && (purchase.payments?.length ?? 0) > 0 && (
        <Card>
          <Copy>Pagos (simulados){refundLabel(purchase)}</Copy>
          {purchase.refunded_at && <Copy muted>Reembolso: {dateLabel(purchase.refunded_at)}</Copy>}
          {purchase.payments?.map((payment) => (
            <Copy key={payment.id} muted>
              {payment.simulated_reference} · {payment.status} · {money(payment.amount)} · {dateLabel(payment.processed_at)}
              {payment.refunded_at ? ` · reembolsado ${dateLabel(payment.refunded_at)}` : ""}
            </Copy>
          ))}
        </Card>
      )}
    </Page>
  );
}
