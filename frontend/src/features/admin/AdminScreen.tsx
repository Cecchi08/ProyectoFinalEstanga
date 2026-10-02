import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { Catalog, CatalogItem } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  Page,
  Pager,
  ResourceState,
  styles,
  useAction,
} from "../../components/ui";
import { Select } from "../../components/ui/Select";
const names: Record<Catalog, string> = {
  artists: "Artistas",
  genres: "Géneros",
  venues: "Venues",
  cities: "Ciudades",
  provinces: "Provincias",
};
export default function AdminScreen() {
  const [kind, setKind] = useState<Catalog>("artists");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null | undefined>(
    undefined,
  );
  const resource = useResource<CatalogItem[]>(
    `/${kind}${query({ page, q: search.trim() })}`,
  );
  return (
    <Page title="Administración">
      <Button
        title="Gestionar todos los conciertos"
        onPress={() => router.push("/admin/concerts")}
      />
      <View style={styles.row}>
        {(Object.keys(names) as Catalog[]).map((key) => (
          <Button
            key={key}
            title={names[key]}
            secondary={kind !== key}
            onPress={() => {
              setKind(key);
              setPage(1);
              setSearch("");
              setSelected(undefined);
            }}
          />
        ))}
      </View>
      <Field
        label={`Buscar ${names[kind].toLowerCase()}`}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <Button
        title={`Crear en ${names[kind]}`}
        onPress={() => setSelected(null)}
      />
      {selected !== undefined && (
        <CatalogEditor
          key={`${kind}-${selected?.id ?? "new"}`}
          kind={kind}
          item={selected}
          done={async () => {
            setSelected(undefined);
            await resource.reload();
          }}
        />
      )}
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((item) => (
        <Card key={item.id}>
          <Copy>{item.name}</Copy>
          <Copy muted>
            #{item.id}
            {item.address ? ` · ${item.address}` : ""}
          </Copy>
          <Button
            title={`Editar ${item.name}`}
            secondary
            onPress={() => setSelected(item)}
          />
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
function CatalogEditor({
  kind,
  item,
  done,
}: {
  kind: Catalog;
  item: CatalogItem | null;
  done(): Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [genres, setGenres] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const action = useAction();
  useEffect(() => {
    setForm({
      name: item?.name ?? "",
      description: item?.description ?? "",
      image_url: item?.image_url ?? "",
      address: item?.address ?? "",
      city_id: item?.city_id ?? "",
      province_id: item?.province_id ?? "",
      capacity: String(item?.capacity ?? ""),
    });
    setGenres(item?.genres?.map((g) => g.id) ?? []);
  }, [item]);
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <Card>
      <Copy>{item ? `Editar ${item.name}` : "Nuevo registro"}</Copy>
      <Field
        label="Nombre"
        value={form.name ?? ""}
        onChangeText={(v) => set("name", v)}
      />
      {kind === "artists" && (
        <>
          <Field
            label="Descripción"
            value={form.description ?? ""}
            onChangeText={(v) => set("description", v)}
          />
          <Field
            label="URL de imagen"
            value={form.image_url ?? ""}
            onChangeText={(v) => set("image_url", v)}
          />
          <Select
            label="Géneros"
            path="/genres"
            multiple
            values={genres}
            onChange={setGenres}
          />
        </>
      )}
      {kind === "cities" && (
        <Select
          label="Provincia"
          path="/provinces"
          values={form.province_id ? [form.province_id] : []}
          onChange={(v) => set("province_id", v[0] ?? "")}
        />
      )}{" "}
      {kind === "venues" && (
        <>
          <Select
            label="Ciudad"
            path="/cities"
            values={form.city_id ? [form.city_id] : []}
            onChange={(v) => set("city_id", v[0] ?? "")}
          />
          <Field
            label="Dirección"
            value={form.address ?? ""}
            onChangeText={(v) => set("address", v)}
          />
          <Field
            label="Capacidad (opcional)"
            value={form.capacity ?? ""}
            onChangeText={(v) => set("capacity", v)}
          />
        </>
      )}
      <ActionFeedback action={action} />
      <Button
        title="Guardar catálogo"
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            const body = {
              name: form.name,
              ...(kind === "artists"
                ? {
                    description: form.description || null,
                    image_url: form.image_url || null,
                    genre_ids: genres,
                  }
                : {}),
              ...(kind === "cities" ? { province_id: form.province_id } : {}),
              ...(kind === "venues"
                ? {
                    city_id: form.city_id,
                    address: form.address,
                    capacity: form.capacity ? Number(form.capacity) : null,
                  }
                : {}),
            };
            await api.request(`/${kind}${item ? `/${item.id}` : ""}`, {
              method: item ? "PATCH" : "POST",
              body,
            });
            await done();
          })
        }
      />
      {item && (
        <Button
          title={confirm ? "Confirmar eliminación" : "Eliminar registro"}
          secondary
          danger
          disabled={action.busy}
          onPress={() =>
            confirm
              ? void action.run(async () => {
                  await api.request(`/${kind}/${item.id}`, {
                    method: "DELETE",
                  });
                  await done();
                })
              : setConfirm(true)
          }
        />
      )}
      <Button title="Cerrar edición" secondary onPress={() => void done()} />
    </Card>
  );
}
