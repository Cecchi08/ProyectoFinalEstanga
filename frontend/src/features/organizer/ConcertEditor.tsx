import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { Concert, TicketType } from "../../types/api";
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
export default function ConcertEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id && id !== "new");
  const auth = useAuth();
  const resource = useResource<Concert>(editing ? `/concerts/${id}` : null);
  const action = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const [artists, setArtists] = useState<string[]>([]);
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
        venue_id: concert.venue_id,
        concert_type_id: concert.concert_type_id,
      });
      setArtists(concert.artists.map((a) => a.id));
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
        venue_id: form.venue_id ?? "",
        concert_type_id: form.concert_type_id ?? "",
        artist_ids: artists,
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
              <Select
                label="Venue"
                path="/venues"
                values={form.venue_id ? [form.venue_id] : []}
                onChange={(v) => set("venue_id", v[0] ?? "")}
              />
              <Select
                label="Tipo de concierto"
                path="/concert-types"
                values={form.concert_type_id ? [form.concert_type_id] : []}
                onChange={(v) => set("concert_type_id", v[0] ?? "")}
              />
              <Select
                label="Artistas"
                path="/artists"
                multiple
                values={artists}
                onChange={setArtists}
              />
              <Select
                label="Géneros"
                path="/genres"
                multiple
                values={genres}
                onChange={setGenres}
              />
              {!editing && auth.roles.includes("ADMIN") && (
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
