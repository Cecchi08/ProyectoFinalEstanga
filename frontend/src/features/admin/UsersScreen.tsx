import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import {
  ASSIGNABLE_ROLES,
  primaryRole,
  ROLE_LABELS,
  ROLES,
  type AdminProfileRequest,
  type AdminUser,
  type AuditAction,
  type AuditEntity,
  type AuditEntry,
  type Role,
  type RoleChange,
} from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  Page,
  Pager,
  ResourceState,
  colors,
  dateLabel,
  styles,
  useAction,
  useBento,
} from "../../components/ui";
const fullName = (user: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ") ||
  user.email ||
  "Cuenta sin nombre";
export const STATUS_LABELS: Record<string, string> = { ACTIVE: "Activa", BLOCKED: "Suspendida", DELETED: "Eliminada" };
const profiles = (roles: Role[]) =>
  roles.length ? ROLE_LABELS[primaryRole(roles)] : "Sin rol";
// GET /admin/profile-requests (users.manage): pending requests first. Approving grants the profile; rejecting needs a reason.
function ProfileRequestsPanel() {
  const requests = useResource<AdminProfileRequest[]>("/admin/profile-requests?status=PENDING&limit=50");
  const action = useAction();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decide = (item: AdminProfileRequest, approve: boolean) =>
    action.run(async () => {
      const reason = reasons[item.id]?.trim() ?? "";
      if (!approve && reason.length < 3) throw new Error("Indicá el motivo del rechazo (mínimo 3 caracteres).");
      await api.request(`/admin/profile-requests/${item.id}/${approve ? "approve" : "reject"}`, {
        method: "POST",
        body: approve ? (reason ? { reason } : {}) : { reason },
      });
      await requests.reload();
      action.setMessage(approve ? `${ROLE_LABELS[item.role]} concedido a ${item.email ?? "la cuenta"}.` : `Solicitud rechazada: ${item.email ?? "la cuenta"}.`);
    });
  return (
    <Card variant="featured">
      <View style={styles.between}>
        <Copy size="subheading" weight="700">Solicitudes de perfil pendientes</Copy>
        <View style={styles.badge}>
          <Copy size="label" color={colors.accentText}>REVISIÓN</Copy>
        </View>
      </View>
      <ActionFeedback action={action} />
      <ResourceState
        {...requests}
        empty={requests.result?.data.length === 0}
        retry={() => void requests.reload()}
      />
      {requests.result?.data.map((item) => (
        <Card key={item.id} variant="subtle">
          <Copy weight="700">
            {ROLE_LABELS[item.role]} · {`${item.first_name ?? ""} ${item.last_name ?? ""}`.trim() || item.email || "Usuario"}
          </Copy>
          <Copy muted size="small">
            {item.email ?? "sin email"} · pedido el {dateLabel(item.created_at)}
            {item.reason ? ` · ${item.reason}` : ""}
          </Copy>
          <Field
            label={`Motivo del rechazo para ${item.email ?? "la solicitud"}`}
            value={reasons[item.id] ?? ""}
            onChangeText={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
          />
          <View style={styles.row}>
            <Button title={`Aprobar ${ROLE_LABELS[item.role]}`} disabled={action.busy} onPress={() => void decide(item, true)} />
            <Button title="Rechazar solicitud" secondary danger disabled={action.busy} onPress={() => void decide(item, false)} />
          </View>
        </Card>
      ))}
    </Card>
  );
}
// GET /admin/users (users.manage). Search covers email and name; the filter uses role codes.
export default function UsersScreen() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState("");
  const resource = useResource<AdminUser[]>(
    `/admin/users${query({ page, q: search.trim(), role: role || undefined, status: status || undefined })}`,
  );
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  return (
    <Page
      title="Usuarios"
      subtitle="Asigná y quitá perfiles, suspendé o reactivá cuentas. Cada cambio queda registrado en la auditoría."
    >
      <View style={styles.row}>
        <Button title="Ver auditoría" secondary onPress={() => router.push("/admin/audit")} />
        <Button title="Volver a administración" secondary onPress={() => router.push("/admin")} />
      </View>
      <ProfileRequestsPanel />
      <Card variant="subtle">
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
        <View style={styles.row}>
          {["", "ACTIVE", "BLOCKED"].map((value) => (
            <Button
              key={value || "any"}
              title={value ? STATUS_LABELS[value] : "Cualquier estado"}
              secondary={status !== value}
              onPress={() => {
                setStatus(value);
                setPage(1);
              }}
            />
          ))}
        </View>
      </Card>
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((user) => (
          <View key={user.id} style={bento.cell(1, cols)}>
            <Card style={{ flex: 1, justifyContent: "space-between" }}>
              <View style={{ gap: 6 }}>
                <View style={styles.between}>
                  <Copy size="subheading" weight="700">{fullName(user)}</Copy>
                  <View style={user.status === "ACTIVE" ? styles.badge : styles.badgeMuted}>
                    <Copy size="label" color={user.status === "ACTIVE" ? colors.accentText : colors.muted}>
                      {STATUS_LABELS[user.status] ?? user.status}
                    </Copy>
                  </View>
                </View>
                <Copy muted size="small">
                  {user.email ?? "sin email"} · {STATUS_LABELS[user.status] ?? user.status}
                  {user.is_guest ? " · invitado" : ""}
                </Copy>
                <Copy muted size="small">Rol principal: {profiles(user.roles)}</Copy>
              </View>
              <Button
                title={`Gestionar cuenta de ${fullName(user)}`}
                onPress={() => router.push(`/admin/users/${user.id}`)}
              />
            </Card>
          </View>
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
// POST /admin/users/:id/roles with replace: true sets the single primary role of the account.
export function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<AdminUser>(`/admin/users/${id}`);
  const audit = useResource<AuditEntry[]>(
    `/admin/audit${query({ target_user_id: id, limit: 10 })}`,
  );
  const user = resource.result?.data;
  const action = useAction();
  const [reason, setReason] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [confirmStatus, setConfirmStatus] = useState(false);
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

  // POST /admin/users/:id/suspend (motivo obligatorio) y /reactivate. Suspender cierra las sesiones de la cuenta.
  const changeStatus = (suspend: boolean) =>
    action.run(async () => {
      if (suspend && statusReason.trim().length < 3) throw new Error("Indicá el motivo de la suspensión (mínimo 3 caracteres).");
      await api.request<AdminUser>(`/admin/users/${id}/${suspend ? "suspend" : "reactivate"}`, {
        method: "POST",
        body: { reason: statusReason.trim() || null },
      });
      setConfirmStatus(false);
      setStatusReason("");
      await resource.reload();
      await audit.reload();
      action.setMessage(suspend ? "Cuenta suspendida y sesiones cerradas." : "Cuenta reactivada.");
    });
  const apply = (role: Role) =>
    action.run(async () => {
      const { data } = await api.request<RoleChange>(
        `/admin/users/${id}/roles`,
        { method: "POST", body: { role, reason: reason.trim() || null, replace: true } },
      );
      setReason("");
      await resource.reload();
      await audit.reload();
      action.setMessage(
        data.changed
          ? `Rol principal actualizado a ${ROLE_LABELS[role]}.`
          : `La cuenta ya tenía como rol principal ${ROLE_LABELS[role]}.`,
      );
    });
  return (
    <Page title={user ? fullName(user) : "Cuenta"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {user && (
        <BentoGrid>
          <View style={[bento.cell(1, cols), { gap: 16 }]}>
            <Card variant="featured">
              <View style={styles.between}>
                <Copy size="subheading" weight="700">
                  {user.email ?? "sin email"}
                </Copy>
                <View style={user.status === "ACTIVE" ? styles.badge : styles.badgeMuted}>
                  <Copy size="label" color={user.status === "ACTIVE" ? colors.accentText : colors.muted}>
                    {STATUS_LABELS[user.status] ?? user.status}
                  </Copy>
                </View>
              </View>
              <Copy muted size="small">
                Estado {STATUS_LABELS[user.status] ?? user.status}
                {user.is_guest ? " · cuenta de invitado" : ""} ·{" "}
                {user.email_verified_at
                  ? `email verificado ${dateLabel(user.email_verified_at)}`
                  : "email sin verificar"}
              </Copy>
              <Copy muted size="small">
                Alta {dateLabel(user.created_at)}
                {user.last_login_at
                  ? ` · último ingreso ${dateLabel(user.last_login_at)}`
                  : " · nunca ingresó"}
              </Copy>
              <Copy muted size="small">Rol principal: {profiles(user.roles)}</Copy>
            </Card>

            {["ACTIVE", "BLOCKED"].includes(user.status) && (
              <Card>
                <Copy size="subheading" weight="700">{user.status === "ACTIVE" ? "Suspender cuenta" : "Reactivar cuenta"}</Copy>
                <Copy muted size="small">
                  {user.status === "ACTIVE"
                    ? "La cuenta no podrá ingresar y se cierran sus sesiones. No se borra ningún dato."
                    : "La cuenta vuelve a poder ingresar con su rol actual."}
                </Copy>
                <Field
                  label={user.status === "ACTIVE" ? "Motivo (obligatorio, queda en la auditoría)" : "Motivo (opcional)"}
                  value={statusReason}
                  onChangeText={setStatusReason}
                />
                <Button
                  title={
                    user.status === "ACTIVE"
                      ? confirmStatus ? "Confirmar suspensión" : "Suspender cuenta"
                      : "Reactivar cuenta"
                  }
                  danger={user.status === "ACTIVE"}
                  secondary={user.status === "ACTIVE" && !confirmStatus}
                  disabled={action.busy}
                  onPress={() =>
                    user.status !== "ACTIVE"
                      ? void changeStatus(false)
                      : confirmStatus ? void changeStatus(true) : setConfirmStatus(true)
                  }
                />
              </Card>
            )}

            <Card>
              <Copy size="subheading" weight="700">Últimos cambios de esta cuenta</Copy>
              <ResourceState
                {...audit}
                empty={audit.result?.data.length === 0}
                retry={() => void audit.reload()}
              />
              {audit.result?.data.map((entry) => (
                <Copy key={entry.id} muted size="small">
                  {dateLabel(entry.created_at)} · {ACTIONS[entry.action] ?? entry.action} ·{" "}
                  {entry.role ? ROLE_LABELS[entry.role] : "—"}
                </Copy>
              ))}
            </Card>
          </View>

          <View style={[bento.cell(1, cols), { gap: 16 }]}>
            {(user.is_guest || user.status !== "ACTIVE") && (
              <Card variant="subtle">
                <Copy muted>
                  Solo se asignan roles a cuentas registradas y activas.
                </Copy>
              </Card>
            )}
            <Card>
              <Copy size="subheading" weight="700">Rol principal de la cuenta</Copy>
              <Copy muted size="small">
                Cada cuenta tiene un único rol principal activo. Al seleccionar un nuevo rol, reemplaza al anterior.
              </Copy>
              <Field
                label="Motivo del cambio de rol (opcional, queda en la auditoría)"
                value={reason}
                onChangeText={setReason}
              />
              <View style={{ gap: 10 }}>
                {ASSIGNABLE_ROLES.map((role) => {
                  const held = primaryRole(user.roles) === role && user.roles.length === 1;
                  return (
                    <View key={role} style={[styles.between, { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <Copy weight="600">
                        {ROLE_LABELS[role]} · {held ? "rol activo" : "disponible"}
                      </Copy>
                      {held ? (
                        <View style={styles.badge}>
                          <Copy size="label" color={colors.accentText}>ACTIVO</Copy>
                        </View>
                      ) : (
                        <Button
                          title={`Establecer como ${ROLE_LABELS[role]}`}
                          secondary
                          disabled={action.busy || user.is_guest || user.status !== "ACTIVE"}
                          onPress={() => void apply(role)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            </Card>
          </View>
        </BentoGrid>
      )}
      <Button title="Volver al listado" secondary onPress={() => router.push("/admin/users")} />
    </Page>
  );
}
export const ACTIONS: Record<AuditAction, string> = {
  ROLE_GRANTED: "Perfil asignado",
  ROLE_REVOKED: "Perfil quitado",
  ROLE_SELF_ACTIVATED: "Perfil activado por el usuario",
  USER_SUSPENDED: "Cuenta suspendida",
  USER_REACTIVATED: "Cuenta reactivada",
  ORDER_PAYMENT_APPROVED: "Pago simulado aprobado",
  ORDER_PAYMENT_REJECTED: "Pago simulado rechazado",
  ORDER_REFUNDED: "Compra reembolsada",
  SERVICE_PROVIDER_VERIFIED: "Empresa verificada",
  SERVICE_PROVIDER_UNVERIFIED: "Verificación quitada",
  ESTABLISHMENT_APPROVED: "Establecimiento aprobado",
  ESTABLISHMENT_REJECTED: "Establecimiento rechazado",
  CONCERT_PUBLISHED: "Concierto publicado",
  CONCERT_CANCELLED: "Concierto cancelado",
  RESERVATION_REFUNDED: "Reserva de espacio reembolsada",
  PROFILE_REQUESTED: "Solicitud de perfil",
  PROFILE_REQUEST_APPROVED: "Solicitud de perfil aprobada",
  PROFILE_REQUEST_REJECTED: "Solicitud de perfil rechazada",
};
const ENTITIES: Record<AuditEntity, string> = { USER: "Cuentas", ORDER: "Compras", SERVICE_PROVIDER: "Empresas de servicios", ESTABLISHMENT: "Establecimientos", CONCERT: "Conciertos", RESERVATION: "Reservas de espacios", PROFILE_REQUEST: "Solicitudes de perfil" };
// GET /admin/audit (users.manage), newest first, filterable by target or actor.
export function AuditScreen() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState<AuditEntity | "">("");
  const resource = useResource<AuditEntry[]>(
    `/admin/audit${query({
      page,
      entity_type: entity || undefined,
    })}`,
  );
  const bento = useBento();
  const cols = bento.isDesktop ? 2 : 1;

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
      details?.target_email ? `Cuenta: ${String(details.target_email)}` : "",
      details?.reason ? `Motivo: ${String(details.reason)}` : "",
      details?.amount ? `Importe ${String(details.amount)} ${String(details.currency ?? "")}`.trim() : "",
    ];
    return parts.filter(Boolean).join(" · ");
  };
  return (
    <Page
      title="Auditoría"
      subtitle="Perfiles, suspensiones, pagos y reembolsos simulados, verificaciones, aprobación de espacios y estados de conciertos, de lo más nuevo a lo más viejo."
    >
      <View style={styles.row}>
        <Button title="Ver usuarios" secondary onPress={() => router.push("/admin/users")} />
      </View>
      <Card variant="subtle">
        <View style={styles.row}>
          {(["", "USER", "ORDER", "SERVICE_PROVIDER", "ESTABLISHMENT", "CONCERT", "RESERVATION", "PROFILE_REQUEST"] as const).map((value) => (
            <Button
              key={value || "all"}
              title={value ? ENTITIES[value] : "Todo"}
              secondary={entity !== value}
              onPress={() => {
                setEntity(value);
                setPage(1);
              }}
            />
          ))}
        </View>
      </Card>
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((entry) => (
          <View key={entry.id} style={bento.cell(1, cols)}>
            <Card style={{ flex: 1, justifyContent: "space-between" }}>
              <View style={{ gap: 6 }}>
                <Copy weight="700">
                  {ACTIONS[entry.action] ?? entry.action}
                  {entry.action.startsWith("ROLE_") ? ` · ${entry.role ? ROLE_LABELS[entry.role] : "perfil eliminado"}` : ""}
                </Copy>
                <Copy muted size="small">
                  {dateLabel(entry.created_at)}
                  {entry.entity_type ? ` · ${ENTITIES[entry.entity_type]}` : ""}
                </Copy>
                {detail(entry) ? <Copy muted size="small">{detail(entry)}</Copy> : null}
              </View>
              {entry.target_user_id && (
                <Button
                  title="Ver cuenta afectada"
                  secondary
                  onPress={() => router.push(`/admin/users/${entry.target_user_id}`)}
                />
              )}
            </Card>
          </View>
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
