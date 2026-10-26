import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLES,
  type AdminUser,
  type AuditEntry,
  type Role,
  type RoleChange,
} from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  Page,
  Pager,
  ResourceState,
  dateLabel,
  styles,
  useAction,
} from "../../components/ui";
const fullName = (user: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ") ||
  user.email ||
  "Cuenta sin nombre";
const profiles = (roles: Role[]) =>
  roles.length ? roles.map((role) => ROLE_LABELS[role]).join(" · ") : "Sin perfiles";
// GET /admin/users (users.manage). Search covers email and name; the filter uses role codes.
export default function UsersScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const resource = useResource<AdminUser[]>(
    `/admin/users${query({ page, q: search.trim(), role: role || undefined })}`,
  );
  return (
    <Page
      title="Perfiles de usuarios"
      subtitle="Asigná y quitá perfiles. Cada cambio queda registrado en la auditoría."
    >
      <View style={styles.row}>
        <Button title="Ver auditoría" secondary onPress={() => router.push("/admin/audit")} />
        <Button title="Volver a administración" secondary onPress={() => router.push("/admin")} />
      </View>
      <Field
        label="Buscar por nombre o email"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <View style={styles.row}>
        {["", ...ROLES].map((value) => (
          <Button
            key={value || "all"}
            title={value ? ROLE_LABELS[value as Role] : "Todos"}
            secondary={role !== value}
            onPress={() => {
              setRole(value as Role | "");
              setPage(1);
            }}
          />
        ))}
      </View>
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((user) => (
        <Card key={user.id}>
          <Copy>{fullName(user)}</Copy>
          <Copy muted>
            #{user.id} · {user.email ?? "sin email"} · {user.status}
            {user.is_guest ? " · invitado" : ""}
          </Copy>
          <Copy muted>{profiles(user.roles)}</Copy>
          <Button
            title={`Gestionar perfiles de ${fullName(user)}`}
            onPress={() => router.push(`/admin/users/${user.id}`)}
          />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
// POST /admin/users/:id/roles and DELETE /admin/users/:id/roles/:role. The API refuses to
// leave an account without profiles (LAST_ROLE) or the platform without an active ADMIN (LAST_ADMIN).
export function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<AdminUser>(`/admin/users/${id}`);
  const audit = useResource<AuditEntry[]>(
    `/admin/audit${query({ target_user_id: id, limit: 10 })}`,
  );
  const user = resource.result?.data;
  const action = useAction();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<Role | null>(null);
  const apply = (role: Role, grant: boolean) =>
    action.run(async () => {
      const { data } = await api.request<RoleChange>(
        grant
          ? `/admin/users/${id}/roles`
          : `/admin/users/${id}/roles/${role}`,
        grant
          ? { method: "POST", body: { role, reason: reason.trim() || null } }
          : { method: "DELETE", body: { reason: reason.trim() || null } },
      );
      setConfirm(null);
      setReason("");
      await resource.reload();
      await audit.reload();
      action.setMessage(
        data.changed
          ? `Perfil ${ROLE_LABELS[role]} ${grant ? "asignado" : "quitado"}.`
          : `La cuenta ya tenía el perfil ${ROLE_LABELS[role]}.`,
      );
    });
  return (
    <Page title={user ? fullName(user) : "Cuenta"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {user && (
        <>
          <Card>
            <Copy>
              #{user.id} · {user.email ?? "sin email"}
            </Copy>
            <Copy muted>
              Estado {user.status}
              {user.is_guest ? " · cuenta de invitado" : ""} ·{" "}
              {user.email_verified_at
                ? `email verificado ${dateLabel(user.email_verified_at)}`
                : "email sin verificar"}
            </Copy>
            <Copy muted>
              Alta {dateLabel(user.created_at)}
              {user.last_login_at
                ? ` · último ingreso ${dateLabel(user.last_login_at)}`
                : " · nunca ingresó"}
            </Copy>
            <Copy muted>{profiles(user.roles)}</Copy>
          </Card>
          {(user.is_guest || user.status !== "ACTIVE") && (
            <Card>
              <Copy muted>
                Solo se asignan perfiles a cuentas registradas y activas.
              </Copy>
            </Card>
          )}
          <Card>
            <Copy>Perfiles</Copy>
            <Copy muted>
              GUEST no se asigna ni se quita a mano: es parte del flujo de invitado.
            </Copy>
            <Field
              label="Motivo (opcional, queda en la auditoría)"
              value={reason}
              onChangeText={setReason}
            />
            {ASSIGNABLE_ROLES.map((role) => {
              const held = user.roles.includes(role);
              return (
                <View key={role} style={styles.row}>
                  <Copy>
                    {ROLE_LABELS[role]} · {held ? "asignado" : "no asignado"}
                  </Copy>
                  {held ? (
                    <Button
                      title={
                        confirm === role
                          ? `Confirmar quitar ${ROLE_LABELS[role]}`
                          : `Quitar ${ROLE_LABELS[role]}`
                      }
                      secondary
                      danger
                      disabled={action.busy}
                      onPress={() =>
                        confirm === role
                          ? void apply(role, false)
                          : setConfirm(role)
                      }
                    />
                  ) : (
                    <Button
                      title={`Asignar ${ROLE_LABELS[role]}`}
                      secondary
                      disabled={action.busy || user.is_guest || user.status !== "ACTIVE"}
                      onPress={() => void apply(role, true)}
                    />
                  )}
                </View>
              );
            })}
          </Card>
          <Card>
            <Copy>Últimos cambios de esta cuenta</Copy>
            <ResourceState
              {...audit}
              empty={audit.result?.data.length === 0}
              retry={() => void audit.reload()}
            />
            {audit.result?.data.map((entry) => (
              <Copy key={entry.id} muted>
                {dateLabel(entry.created_at)} · {ACTIONS[entry.action]} ·{" "}
                {entry.role ? ROLE_LABELS[entry.role] : "—"} · por #
                {entry.actor_user_id}
              </Copy>
            ))}
          </Card>
        </>
      )}
      <Button title="Volver al listado" secondary onPress={() => router.push("/admin/users")} />
    </Page>
  );
}
export const ACTIONS: Record<AuditEntry["action"], string> = {
  ROLE_GRANTED: "Perfil asignado",
  ROLE_REVOKED: "Perfil quitado",
  ROLE_SELF_ACTIVATED: "Perfil activado por el usuario",
};
// GET /admin/audit (users.manage), newest first, filterable by target or actor.
export function AuditScreen() {
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState("");
  const [actor, setActor] = useState("");
  const resource = useResource<AuditEntry[]>(
    `/admin/audit${query({
      page,
      target_user_id: target.trim() || undefined,
      actor_user_id: actor.trim() || undefined,
    })}`,
  );
  // MySQL JSON arrives parsed, but a driver that hands it back as text must not break the list.
  const detail = (entry: AuditEntry) => {
    let details: Record<string, unknown> | null;
    try {
      details =
        typeof entry.details === "string"
          ? (JSON.parse(entry.details) as Record<string, unknown>)
          : entry.details;
    } catch {
      details = null;
    }
    const parts = [
      details?.target_email ? String(details.target_email) : "",
      details?.reason ? `Motivo: ${String(details.reason)}` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  };
  return (
    <Page
      title="Auditoría de perfiles"
      subtitle="Cada asignación, baja y autoservicio, de lo más nuevo a lo más viejo."
    >
      <View style={styles.row}>
        <Button title="Ver usuarios" secondary onPress={() => router.push("/admin/users")} />
      </View>
      <Field
        label="ID de la cuenta afectada (opcional)"
        value={target}
        keyboardType="numeric"
        onChangeText={(value) => {
          setTarget(value.replace(/\D/g, ""));
          setPage(1);
        }}
      />
      <Field
        label="ID de quien hizo el cambio (opcional)"
        value={actor}
        keyboardType="numeric"
        onChangeText={(value) => {
          setActor(value.replace(/\D/g, ""));
          setPage(1);
        }}
      />
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((entry) => (
        <Card key={entry.id}>
          <Copy>
            {ACTIONS[entry.action]} ·{" "}
            {entry.role ? ROLE_LABELS[entry.role] : "perfil eliminado"}
          </Copy>
          <Copy muted>
            {dateLabel(entry.created_at)} · cuenta #{entry.target_user_id} · por #
            {entry.actor_user_id}
          </Copy>
          {detail(entry) ? <Copy muted>{detail(entry)}</Copy> : null}
          <Button
            title={`Ver cuenta #${entry.target_user_id}`}
            secondary
            onPress={() => router.push(`/admin/users/${entry.target_user_id}`)}
          />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
