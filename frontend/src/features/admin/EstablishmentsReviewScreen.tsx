import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { PendingEstablishment } from "../../types/api";
import { ActionFeedback, BentoGrid, Button, Card, Copy, Field, Page, ResourceState, colors, dateLabel, styles, useAction, useBento } from "../../components/ui";

// GET /marketplace/establishments/pending (marketplace.admin): establishments their owners sent to review.
// Approving publishes them; rejecting sends them back to DRAFT with the reason. Both are audited.
export default function EstablishmentsReviewScreen() {
  const resource = useResource<PendingEstablishment[]>("/marketplace/establishments/pending");
  const action = useAction();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  const decide = (item: PendingEstablishment, approve: boolean) =>
    action.run(async () => {
      const reason = reasons[item.id]?.trim() ?? "";
      if (!approve && reason.length < 3) throw new Error("Indicá el motivo del rechazo (mínimo 3 caracteres).");
      await api.request(`/marketplace/establishments/${item.id}/${approve ? "approve" : "reject"}`, {
        method: "POST",
        body: approve ? {} : { reason },
      });
      await resource.reload();
      action.setMessage(approve ? `${item.name} aprobado y publicado.` : `${item.name} rechazado: vuelve a borrador con el motivo.`);
    });
  return (
    <Page title="Establecimientos en revisión" subtitle="Solo los aprobados aparecen en las búsquedas públicas.">
      <View style={styles.row}>
        <Button title="Volver a administración" secondary onPress={() => router.push("/admin")} />
      </View>
      <ActionFeedback action={action} />
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      <BentoGrid>
        {resource.result?.data.map((item) => (
          <View key={item.id} style={bento.cell(1, cols)}>
            <Card style={{ flex: 1, justifyContent: "space-between" }}>
              <View style={{ gap: 8 }}>
                <View style={styles.between}>
                  <Copy size="subheading" weight="700">{item.name}</Copy>
                  <View style={styles.badge}>
                    <Copy size="label" color={colors.accentText}>PENDIENTE</Copy>
                  </View>
                </View>
                <Copy muted size="small">{item.organization_name} · {item.address_line}, {item.city_name}</Copy>
                <Copy muted size="small">{item.venues} espacio(s) · enviado {dateLabel(item.updated_at)}</Copy>
                {item.description && <Copy muted size="small">{item.description}</Copy>}
              </View>
              <View style={{ gap: 10 }}>
                <Field
                  label={`Motivo del rechazo de ${item.name}`}
                  value={reasons[item.id] ?? ""}
                  onChangeText={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
                />
                <View style={styles.row}>
                  <Button title={`Aprobar ${item.name}`} disabled={action.busy} onPress={() => void decide(item, true)} />
                  <Button title={`Rechazar ${item.name}`} secondary danger disabled={action.busy} onPress={() => void decide(item, false)} />
                </View>
              </View>
            </Card>
          </View>
        ))}
      </BentoGrid>
    </Page>
  );
}
