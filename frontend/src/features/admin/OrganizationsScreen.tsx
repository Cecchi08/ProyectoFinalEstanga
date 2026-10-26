import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { AdminOrganization } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Page, Pager, ResourceState, dateLabel, styles, useAction } from "../../components/ui";

const KINDS = { "": "Todas", VENUE: "Con establecimientos", SERVICES: "Empresas de servicios" } as const;
const PUBLICATION: Record<string, string> = { DRAFT: "borrador", PUBLISHED: "publicada", ARCHIVED: "archivada" };
// GET /admin/organizations (users.manage or marketplace.admin). Verification of a service company
// (POST /services/providers/:id/verify|unverify) needs services.admin and is audited.
export default function OrganizationsScreen() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<keyof typeof KINDS>("");
  const resource = useResource<AdminOrganization[]>(`/admin/organizations${query({ page, q: search.trim(), kind: kind || undefined })}`);
  const action = useAction();
  const verify = (organization: AdminOrganization, verified: boolean) =>
    action.run(async () => {
      await api.request(`/services/providers/${organization.id}/${verified ? "verify" : "unverify"}`, { method: "POST", body: {} });
      await resource.reload();
      action.setMessage(verified ? `${organization.name} verificada.` : `Se quitó la verificación de ${organization.name}.`);
    });
  return (
    <Page title="Organizaciones" subtitle="Dueños de espacios y empresas de servicios registradas en Venti.">
      <View style={styles.row}>
        <Button title="Volver a administración" secondary onPress={() => router.push("/admin")} />
      </View>
      <Field label="Buscar por nombre, slug o email" value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} />
      <View style={styles.row}>
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((value) => (
          <Button key={value || "all"} title={KINDS[value]} secondary={kind !== value} onPress={() => { setKind(value); setPage(1); }} />
        ))}
      </View>
      <ActionFeedback action={action} />
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((organization) => (
        <Card key={organization.id}>
          <Copy>{organization.name} · {organization.status}</Copy>
          <Copy muted>
            #{organization.id}{organization.legal_name ? ` · ${organization.legal_name}` : ""}{organization.tax_id ? ` · CUIT ${organization.tax_id}` : ""}
            {organization.email ? ` · ${organization.email}` : ""}
          </Copy>
          <Copy muted>
            {organization.members} miembros · {organization.establishments} establecimientos · alta {dateLabel(organization.created_at)}
          </Copy>
          {organization.owners.length > 0 && <Copy muted>Dueños: {organization.owners.join(", ")}</Copy>}
          {organization.service_provider && (
            <>
              <Copy muted>
                Empresa de servicios {PUBLICATION[organization.service_provider.status] ?? organization.service_provider.status}
                {organization.service_provider.is_verified ? " · verificada" : " · sin verificar"}
              </Copy>
              <View style={styles.row}>
                <Button title={`Ver empresa ${organization.name}`} secondary onPress={() => router.push(`/services/providers/${organization.id}`)} />
                {can("services.admin") && (
                  <Button
                    title={organization.service_provider.is_verified ? "Quitar verificación" : "Verificar empresa"}
                    secondary={organization.service_provider.is_verified}
                    disabled={action.busy}
                    onPress={() => void verify(organization, !organization.service_provider?.is_verified)}
                  />
                )}
              </View>
            </>
          )}
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
