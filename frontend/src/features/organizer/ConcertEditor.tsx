import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { P, can } from "../../constants/access";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Concert, StaffMember, TicketType } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  Page,
  ResourceState,
  styles,
  useAction,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
const iso = (value: string) => {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(
      "Usá fechas ISO con zona horaria, por ejemplo 2027-06-10T23:00:00Z.",
    );
  return date.toISOString();
};
const location = (form: Record<string, string>) => {
  const linked = Boolean(form.venue_id || form.reservation_id);
  const value = (key: string) => form[key]?.trim() || (linked ? undefined : null);
  return { venue_name: value("venue_name"), address_line: value("address_line"), city_id: value("city_id") };
};
export default function ConcertEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id && id !== "new");
  const auth = useAuth();
  const resource = useResource<Concert>(editing ? `/concerts/${id}` : null);
  const action = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const [genres, setGenres] = useState<string[]>([]);
  const [confirm, setConfirm] = useState("");
  const concert = resource.result?.data;
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (concert) {
      setForm({
        name: concert.name,
        description: concert.description ?? "",
        image_url: concert.image_url ?? "",
        start_datetime: concert.start_datetime,
        end_datetime: concert.end_datetime ?? "",
        artist_name: concert.artist_name,
        venue_id: concert.venue_id ?? "",
        reservation_id: concert.reservation_id ?? "",
        venue_name: concert.venue_name ?? "",
        address_line: concert.address_line ?? "",
        city_id: concert.city_id ?? "",
      });
      setGenres(concert.genres.map((g) => g.id));
    }
  }, [concert]);
  const save = () =>
    action.run(async () => {
      const body = {
        name: form.name ?? "",
        description: form.description || null,
        image_url: form.image_url || null,
        start_datetime: iso(form.start_datetime ?? ""),
        end_datetime: iso(form.end_datetime ?? ""),
        artist_name: form.artist_name ?? "",
        // With a space or reservation, blank place fields are omitted so the backend copies them from the space.
        // A reservation already fixes the space: sending venue_id too would have to match it.
        venue_id: form.reservation_id ? undefined : form.venue_id || null,
        reservation_id: form.reservation_id || null,
        ...location(form),
        genre_ids: genres,
        ...(!editing && form.organizer_id
          ? { organizer_id: form.organizer_id }
          : {}),
      };
      const { data } = await api.request<Concert>(
        editing ? `/concerts/${id}` : "/concerts",
        { method: editing ? "PATCH" : "POST", body },
      );
      if (!editing) router.replace(`/organizer/${data.id}`);
      else {
        await resource.reload();
        action.setMessage("Concierto guardado.");
      }
    });
  const transition = (operation: string) =>
    action.run(async () => {
      await api.request(
        `/concerts/${id}${operation === "delete" ? "" : `/${operation}`}`,
        {
          method: operation === "delete" ? "DELETE" : "POST",
          ...(operation === "delete" ? {} : { body: {} }),
        },
      );
      setConfirm("");
      if (operation === "delete") router.replace("/organizer");
      else {
        await resource.reload();
        action.setMessage("Estado actualizado.");
      }
    });
  const mutable = !concert || ["DRAFT", "PUBLISHED"].includes(concert.status);
  return (
    <Page
      title={editing ? "Gestionar concierto" : "Nuevo concierto"}
      subtitle="Guardá el borrador, agregá entradas y publicá cuando esté listo."
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {(!editing || concert) && (
        <>
          {concert && (
            <Copy>
              #{concert.id} · {concert.status}
            </Copy>
          )}
          {mutable && (
            <Card>
              <Field
                label="Nombre del concierto"
                value={form.name ?? ""}
                onChangeText={(v) => set("name", v)}
              />
              <Field
                label="Descripción"
                multiline
                value={form.description ?? ""}
                onChangeText={(v) => set("description", v)}
              />
              <Field
                label="URL de imagen"
                value={form.image_url ?? ""}
                onChangeText={(v) => set("image_url", v)}
              />
              <Field
                label="Inicio (ISO con zona horaria)"
                placeholder="2027-06-10T23:00:00Z"
                value={form.start_datetime ?? ""}
                onChangeText={(v) => set("start_datetime", v)}
              />
              <Field
                label="Fin (ISO, opcional)"
                value={form.end_datetime ?? ""}
                onChangeText={(v) => set("end_datetime", v)}
              />
              <Field
                label="Artista"
                value={form.artist_name ?? ""}
                onChangeText={(v) => set("artist_name", v)}
              />
              <Select
                label="Reserva confirmada (opcional)"
                path="/marketplace/reservations?status=CONFIRMED"
                searchable={false}
                itemLabel={(item) => `${String(item.event_name)} · ${String(item.venue_name)} · ${String(item.public_code)}`}
                values={form.reservation_id ? [form.reservation_id] : []}
                onChange={(v) => setForm((current) => ({ ...current, reservation_id: v[0] ?? "", venue_id: "", venue_name: "", address_line: "", city_id: "" }))}
              />
              {!form.reservation_id && (
                <Select
                  label="Espacio del marketplace (opcional)"
                  path="/venues"
                  values={form.venue_id ? [form.venue_id] : []}
                  onChange={(v) => setForm((current) => ({ ...current, venue_id: v[0] ?? "", venue_name: "", address_line: "", city_id: "" }))}
                />
              )}
              <Field
                label="Lugar"
                placeholder={form.venue_id || form.reservation_id ? "Se toma del espacio si lo dejás vacío" : "Nombre de la sala o predio"}
                value={form.venue_name ?? ""}
                onChangeText={(v) => set("venue_name", v)}
              />
              <Field
                label="Dirección (opcional)"
                value={form.address_line ?? ""}
                onChangeText={(v) => set("address_line", v)}
              />
              <Select
                label="Ciudad"
                path="/cities"
                values={form.city_id ? [form.city_id] : []}
                onChange={(v) => set("city_id", v[0] ?? "")}
              />
              <Select
                label="Géneros"
                path="/genres"
                multiple
                values={genres}
                onChange={setGenres}
              />
              {!editing && can(auth.permissions, P.concertsManageAll) && (
                <Field
                  label="ID del organizador (opcional)"
                  value={form.organizer_id ?? ""}
                  onChangeText={(v) => set("organizer_id", v)}
                />
              )}
              <Button
                title="Guardar concierto"
                disabled={action.busy}
                onPress={() => void save()}
              />
            </Card>
          )}
          {concert && (
            <>
              <Copy>Tipos de entrada</Copy>
              {concert.ticket_types.map((type) => (
                <TicketEditor
                  key={`${type.id}-${JSON.stringify(type)}`}
                  concertId={concert.id}
                  ticket={type}
                  mutable={mutable}
                  reload={resource.reload}
                />
              ))}
              {mutable && (
                <TicketEditor concertId={concert.id} reload={resource.reload} />
              )}
              <StaffPanel concertId={concert.id} mutable={mutable} />
              <View style={styles.row}>
                {concert.status === "DRAFT" && (
                  <Button
                    title="Publicar concierto"
                    disabled={action.busy}
                    onPress={() => void transition("publish")}
                  />
                )}
                {mutable && (
                  <Button
                    title={
                      confirm === "cancel"
                        ? "Confirmar cancelación"
                        : "Cancelar concierto"
                    }
                    secondary
                    danger
                    disabled={action.busy}
                    onPress={() =>
                      confirm === "cancel"
                        ? void transition("cancel")
                        : setConfirm("cancel")
                    }
                  />
                )}
                {concert.status === "DRAFT" && (
                  <Button
                    title={
                      confirm === "delete"
                        ? "Confirmar eliminación"
                        : "Eliminar borrador"
                    }
                    secondary
                    danger
                    disabled={action.busy}
                    onPress={() =>
                      confirm === "delete"
                        ? void transition("delete")
                        : setConfirm("delete")
                    }
                  />
                )}
              </View>
            </>
          )}
        </>
      )}
    </Page>
  );
}
function TicketEditor({
  concertId,
  ticket,
  mutable = true,
  reload,
}: {
  concertId: string;
  ticket?: TicketType;
  mutable?: boolean;
  reload(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    name: ticket?.name ?? "",
    price: ticket?.price ?? "",
    stock_total: String(ticket?.stock_total ?? ""),
    sale_start: ticket?.sale_start ?? "",
    sale_end: ticket?.sale_end ?? "",
    max_per_purchase: String(ticket?.max_per_purchase ?? ""),
  });
  const action = useAction();
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <Card>
      <Copy>
        {ticket
          ? `${ticket.name} · $ ${ticket.price} · Cupo ${ticket.stock_total}`
          : "Nuevo tipo de entrada"}
      </Copy>
      {mutable && (
        <Button
          title={
            open
              ? "Cerrar formulario"
              : ticket
                ? `Editar ${ticket.name}`
                : "Agregar tipo de entrada"
          }
          secondary
          onPress={() => setOpen(!open)}
        />
      )}
      <ActionFeedback action={action} />
      {open && (
        <>
          {[
            ["name", "Nombre de entrada"],
            ["price", "Precio"],
            ["stock_total", "Cupo total"],
            ["sale_start", "Venta desde (ISO, opcional)"],
            ["sale_end", "Venta hasta (ISO, opcional)"],
            ["max_per_purchase", "Máximo por compra (opcional)"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={form[key]}
              onChangeText={(v) => set(key, v)}
            />
          ))}
          <Button
            title="Guardar tipo de entrada"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                if (form.price.trim() === "" || form.stock_total.trim() === "")
                  throw new Error("Completá precio y cupo.");
                await api.request(
                  ticket
                    ? `/ticket-types/${ticket.id}`
                    : `/concerts/${concertId}/ticket-types`,
                  {
                    method: ticket ? "PATCH" : "POST",
                    body: {
                      name: form.name,
                      price: Number(form.price),
                      stock_total: Number(form.stock_total),
                      sale_start: iso(form.sale_start),
                      sale_end: iso(form.sale_end),
                      max_per_purchase: form.max_per_purchase
                        ? Number(form.max_per_purchase)
                        : null,
                    },
                  },
                );
                setOpen(false);
                await reload();
                action.setMessage("Entrada guardada.");
              })
            }
          />
          {ticket && (
            <Button
              title={
                confirm ? "Sí, eliminar entrada" : "Eliminar tipo de entrada"
              }
              danger
              secondary
              disabled={action.busy}
              onPress={() =>
                confirm
                  ? void action.run(async () => {
                      await api.request(`/ticket-types/${ticket.id}`, {
                        method: "DELETE",
                      });
                      await reload();
                    })
                  : setConfirm(true)
              }
            />
          )}
        </>
      )}
    </Card>
  );
}
// Staff validates tickets only for the concerts it is assigned to (concert_staff); assigning never grants a role.
function StaffPanel({ concertId, mutable }: { concertId: string; mutable: boolean }) {
  const staff = useResource<StaffMember[]>(`/concerts/${concertId}/staff`);
  const [email, setEmail] = useState("");
  const action = useAction();
  return (
    <Card>
      <Copy>Staff de control de acceso</Copy>
      <ResourceState {...staff} retry={() => void staff.reload()} />
      {staff.result?.data.map((member) => (
        <View key={member.user_id} style={styles.row}>
          <Copy muted>
            {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.email} · {member.email}
          </Copy>
          <Button
            title={`Quitar staff ${member.email}`}
            secondary
            danger
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await api.request(`/concerts/${concertId}/staff/${member.user_id}`, { method: "DELETE" });
                await staff.reload();
              })
            }
          />
        </View>
      ))}
      {staff.result?.data.length === 0 && <Copy muted>Sin staff asignado.</Copy>}
      {mutable && (
        <>
          <Field label="Email del staff" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Button
            title="Asignar staff"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await api.request(`/concerts/${concertId}/staff`, { method: "POST", body: { email } });
                setEmail("");
                await staff.reload();
                action.setMessage("Staff asignado.");
              })
            }
          />
        </>
      )}
      <ActionFeedback action={action} />
    </Card>
  );
}
