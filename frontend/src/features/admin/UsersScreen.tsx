import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import { ASSIGNABLE_ROLES, ROLES, roleLabel } from "../../constants/access";
import type { AdminUser } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Page, Pager, ResourceState, styles, useAction } from "../../components/ui";
import { Codes } from "../marketplace/MarketplaceScreen";

const roleItems = ROLES.map((code) => ({ id: code, code, name: roleLabel(code) }));
// POST/DELETE /admin/users/:id/roles. Every change is audited by the backend; the reason is optional.
export default function UsersScreen() {
  const auth = useAuth();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<{ q?: string; role?: string }>({});
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const resource = useResource<AdminUser[]>(`/admin/users${query({ ...filters, page })}`);
  const action = useAction();
  const change = (user: AdminUser, role: string, grant: boolean) =>
    action.run(async () => {
      const path = `/admin/users/${user.id}/roles`;
      const body = { reason: reason.trim() || null };
      if (grant) await api.request(path, { method: "POST", body: { role, ...body } });
      else await api.request(`${path}/${role}`, { method: "DELETE", body });
      // Changing one's own profiles changes what this session may do.
      if (user.id === auth.user?.id) auth.refreshAccess();
      await resource.reload();
      action.setMessage(`${grant ? "Asignado" : "Quitado"}: ${roleLabel(role)} · ${user.email ?? `#${user.id}`}.`);
    });
  return (
    <Page title="Usuarios y perfiles" subtitle="Asignar y quitar perfiles. Cada cambio queda en la auditoría.">
      <View style={styles.row}>
        <Button title="Volver a Administración" secondary onPress={() => router.push("/admin")} />
        <Button title="Ver auditoría" secondary onPress={() => router.push("/admin/audit")} />
      </View>
      <Card>
        <Field label="Buscar por email o nombre" value={draft} onChangeText={setDraft}
          onSubmitEditing={() => { setFilters({ ...filters, q: draft.trim() || undefined }); setPage(1); }} />
        <Codes label="Filtrar por perfil" items={roleItems} values={filters.role ? [filters.role] : []}
          onChange={(values) => { setFilters({ ...filters, role: values[0] }); setPage(1); }} />
        <Button title="Buscar usuarios" onPress={() => { setFilters({ ...filters, q: draft.trim() || undefined }); setPage(1); }} />
        <Field label="Motivo del cambio (opcional, queda en la auditoría)" value={reason} onChangeText={setReason} />
      </Card>
      <ActionFeedback action={action} />
      <ResourceState {...resource} empty={resource.result?.data.length === 0} retry={() => void resource.reload()} />
      {resource.result?.data.map((user) => (
        <Card key={user.id}>
          <Copy>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "Sin nombre"} · {user.email ?? "sin email"}</Copy>
          <Copy muted>
            #{user.id} · {user.status}{user.is_guest ? " · invitado" : ""} · {user.roles.map(roleLabel).join(", ") || "sin perfiles"}
          </Copy>
          {!user.is_guest && user.status === "ACTIVE" && (
            <View style={styles.row}>
              {ASSIGNABLE_ROLES.filter((role) => !user.roles.includes(role)).map((role) => (
                <Button key={role} title={`Asignar ${roleLabel(role)} a ${user.email ?? user.id}`} secondary disabled={action.busy}
                  onPress={() => void change(user, role, true)} />
              ))}
            </View>
          )}
          <View style={styles.row}>
            {user.roles.filter((role) => role !== "GUEST").map((role) => (
              <Button key={role} title={`Quitar ${roleLabel(role)} a ${user.email ?? user.id}`} secondary danger disabled={action.busy}
                onPress={() => void change(user, role, false)} />
            ))}
          </View>
          <Button title={`Auditoría de ${user.email ?? user.id}`} secondary onPress={() => router.push(`/admin/audit?target_user_id=${user.id}`)} />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
