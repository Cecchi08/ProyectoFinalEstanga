import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Purchase } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  money,
  useAction,
} from "../../components/ui";
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<Purchase>(`/purchases/${id}`);
  const action = useAction();
  const [cancel, setCancel] = useState(false);
  const purchase = resource.result?.data;
  const transition = (operation: string) =>
    action.run(async () => {
      try {
        await api.request(`/purchases/${id}/${operation}`, {
          method: "POST",
          body: {},
        });
        setCancel(false);
      } finally {
        // An expired reservation can change state even when confirmation fails.
        await resource.reload();
      }
      action.setMessage(
        operation === "confirm"
          ? "Compra confirmada. Tus QR están en Entradas."
          : "Compra cancelada.",
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
            ["RESERVED", "PENDING"].includes(purchase.status) && (
              <Copy>Vence: {dateLabel(purchase.expires_at)}</Copy>
            )}
          <ActionFeedback action={action} />
          {["RESERVED", "PENDING"].includes(purchase.status) && (
            <Button
              title="Confirmar compra"
              disabled={action.busy}
              onPress={() => void transition("confirm")}
            />
          )}
          {purchase.status === "CONFIRMED" && (
            <Button
              title="Ver mis entradas QR"
              onPress={() => router.push("/tickets")}
            />
          )}
          {["RESERVED", "PENDING", "CONFIRMED"].includes(purchase.status) && (
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
          <Copy muted>
            Confirmación y devolución internas; no hay pagos externos.
          </Copy>
        </Card>
      )}
    </Page>
  );
}
