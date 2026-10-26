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
import { useAuth } from "../../contexts/AuthContext";
import { P, can } from "../../constants/access";
// Artists and concert venues are no longer catalogs: concerts store artist_name and
// spaces belong to marketplace establishments.
const names: Record<Catalog, string> = {
  genres: "Géneros",
  provinces: "Provincias",
  districts: "Distritos",
  cities: "Ciudades",
};
const detail = (item: CatalogItem) =>
  [`#${item.id}`, item.code, item.postal_code ? `CP ${item.postal_code}` : ""].filter(Boolean).join(" · ");
export default function AdminScreen() {
  const { permissions } = useAuth();
  const catalogs = can(permissions, P.catalogsManage);
  const [kind, setKind] = useState<Catalog>("genres");
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
      <View style={styles.row}>
        {can(permissions, P.usersManage) && <Button title="Usuarios y perfiles" onPress={() => router.push("/admin/users")} />}
        {can(permissions, P.usersManage) && <Button title="Auditoría" secondary onPress={() => router.push("/admin/audit")} />}
        {can(permissions, P.statisticsGlobal) && <Button title="Estadísticas globales" onPress={() => router.push('/admin/statistics')} />}
        {can(permissions, P.concertsManageAll) && (
          <Button title="Gestionar todos los conciertos" onPress={() => router.push("/admin/concerts")} />
        )}
      </View>
      {!catalogs && <Copy muted>Los catálogos requieren el permiso catalogs.manage.</Copy>}
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
      {catalogs && (
        <Button
          title={`Crear en ${names[kind]}`}
          onPress={() => setSelected(null)}
        />
      )}
      {catalogs && selected !== undefined && (
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
          <Copy muted>{detail(item)}</Copy>
          {catalogs && (
            <Button
              title={`Editar ${item.name}`}
              secondary
              onPress={() => setSelected(item)}
            />
          )}
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
  const [confirm, setConfirm] = useState(false);
  const action = useAction();
  useEffect(() => {
    setForm({
      name: item?.name ?? "",
      code: item?.code ?? "",
      province_id: item?.province_id ?? "",
      district_id: item?.district_id ?? "",
      postal_code: item?.postal_code ?? "",
    });
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
      {kind === "provinces" && (
        <Field
          label="Código"
          placeholder="AR-B"
          value={form.code ?? ""}
          onChangeText={(v) => set("code", v.toUpperCase())}
        />
      )}
      {(kind === "districts" || kind === "cities") && (
        <Select
          label="Provincia"
          path="/provinces"
          values={form.province_id ? [form.province_id] : []}
          onChange={(v) => setForm({ ...form, province_id: v[0] ?? "", district_id: "" })}
        />
      )}
      {kind === "cities" && (
        <>
          {form.province_id ? (
            <Select
              label="Distrito"
              path={`/districts?province_id=${encodeURIComponent(form.province_id)}`}
              values={form.district_id ? [form.district_id] : []}
              onChange={(v) => set("district_id", v[0] ?? "")}
            />
          ) : (
            <Copy muted>Elegí la provincia para ver sus distritos.</Copy>
          )}
          <Field
            label="Código postal (opcional)"
            value={form.postal_code ?? ""}
            onChangeText={(v) => set("postal_code", v)}
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
              ...(kind === "provinces" ? { code: form.code } : {}),
              ...(kind === "districts" ? { province_id: form.province_id } : {}),
              ...(kind === "cities"
                ? {
                    province_id: form.province_id,
                    district_id: form.district_id,
                    postal_code: form.postal_code || null,
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
