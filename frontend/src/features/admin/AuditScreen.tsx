import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import { roleLabel } from "../../constants/access";
import type { AuditEntry } from "../../types/api";
import { Button, Card, Copy, Field, Notice, Page, Pager, ResourceState, dateLabel, styles } from "../../components/ui";

const actions: Record<AuditEntry["action"], string> = {
  ROLE_GRANTED: "Perfil asignado",
  ROLE_REVOKED: "Perfil quitado",
  ROLE_SELF_ACTIVATED: "Perfil activado por la persona",
};
const ID = /^[1-9]\d*$/;
// GET /admin/audit, newest first. Optional filter by target user (also reachable from /admin/users).
export default function AuditScreen() {
  const params = useLocalSearchParams<{ target_user_id?: string }>();
  const initial = typeof params.target_user_id === "string" && ID.test(params.target_user_id) ? params.target_user_id : "";
  const [draft, setDraft] = useState(initial);
  const [target, setTarget] = useState(initial);
  const [invalid, setInvalid] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<AuditEntry[]>(`/admin/audit${query({ target_user_id: target || undefined, page })}`);
  const apply = () => {
    if (draft.trim() && !ID.test(draft.trim())) { setInvalid("El ID de usuario es un número."); return; }
    setInvalid(""); setTarget(draft.trim()); setPage(1);
  };
  return (
    <Page title="Auditoría" subtitle="Cambios de perfiles: quién, a quién, cuándo y por qué.">
      <View style={styles.row}>
        <Button title="Volver a Administración" secondary onPress={() => router.push("/admin")} />
        <Button title="Usuarios y perfiles" secondary onPress={() => router.push("/admin/users")} />
      </View>
      <Card>
        <Field label="ID de usuario afectado (opcional)" keyboardType="number-pad" value={draft} onChangeText={setDraft} onSubmitEditing={apply} />
        <Notice message={invalid} error />
        <Button title="Filtrar auditoría" onPress={apply} />
      </Card>
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((entry) => (
        <Card key={entry.id}>
          <Copy>{actions[entry.action] ?? entry.action}: {roleLabel(entry.role ?? entry.details?.role ?? "")}</Copy>
          <Copy muted>
            {dateLabel(entry.created_at)} · afectado #{entry.target_user_id ?? "—"}{entry.details?.target_email ? ` (${entry.details.target_email})` : ""}
            {" · "}por #{entry.actor_user_id ?? "—"}
          </Copy>
          {entry.details?.reason && <Copy muted>Motivo: {entry.details.reason}</Copy>}
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
