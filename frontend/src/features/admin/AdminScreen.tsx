import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { invalidateCatalogCache, useResource } from "../../hooks/useResource";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { Catalog, CatalogItem } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  FormScope,
  Page,
  Pager,
  ResourceState,
  colors,
  styles,
  useAction,
  useBento,
  useForm,
} from "../../components/ui";
import { rules } from "../../utils/validation";
import { Select } from "../../components/ui/Select";
// Artists and concert venues are no longer catalogs: concerts store artist_name and
// spaces belong to marketplace establishments.
const names: Record<Catalog, string> = {
  genres: "Géneros",
  provinces: "Provincias",
  districts: "Distritos",
  cities: "Ciudades",
};
const detail = (item: CatalogItem) =>
  [item.code, item.postal_code ? `CP ${item.postal_code}` : ""].filter(Boolean).join(" · ") || "Registro activo";
export default function AdminScreen() {
  const [kind, setKind] = useState<Catalog>("genres");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selected, setSelected] = useState<CatalogItem | null | undefined>(
    undefined,
  );
  // Each button needs the same permission the endpoint behind it requires.
  const { can } = useAuth();
  const catalogs = can("catalogs.manage");
  const resource = useResource<CatalogItem[]>(
    catalogs ? `/${kind}${query({ page, q: debouncedSearch.trim() })}` : null,
  );
  const bento = useBento();
  const cols = bento.cols;

  return (
    <Page title="Administración" subtitle="Panel central de control de cuentas, auditoría, organizaciones, espacios y catálogos.">
      <Card variant="featured">
        <View style={styles.between}>
          <Copy size="subheading" weight="700">Accesos de gestión</Copy>
          <View style={styles.badge}>
            <Copy size="label" color={colors.accentText}>ADMIN HUB</Copy>
          </View>
        </View>
        <View style={styles.row}>
          {can("users.manage") && (
            <>
              <Button title="Usuarios y perfiles" onPress={() => router.push("/admin/users")} />
              <Button title="Auditoría" secondary onPress={() => router.push("/admin/audit")} />
            </>
          )}
          {can("users.manage", "marketplace.admin") && (
            <Button title="Organizaciones" secondary onPress={() => router.push("/admin/organizations")} />
          )}
          {can("marketplace.admin") && (
            <Button title="Establecimientos en revisión" secondary onPress={() => router.push("/admin/establishments")} />
          )}
          {can("statistics.global") && (
            <Button title="Estadísticas globales" onPress={() => router.push('/admin/statistics')} />
          )}
          {can("concerts.manage_all") && (
            <Button
              title="Gestionar todos los conciertos"
              onPress={() => router.push("/admin/concerts")}
            />
          )}
          {can("orders.read_all", "catalogs.manage") && (
            <Button
              title="Promociones y descuentos"
              secondary
              onPress={() => router.push("/admin/promotions")}
            />
          )}
        </View>
      </Card>

      {!catalogs ? null : (
        <>
          <Card variant="subtle">
            <View style={styles.between}>
              <Copy size="subheading" weight="700">Catálogos del sistema</Copy>
              <Button
                title={`Crear en ${names[kind]}`}
                onPress={() => setSelected(null)}
              />
            </View>
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
          </Card>

          {selected !== undefined && (
            <CatalogEditor
              key={`${kind}-${selected?.id ?? "new"}`}
              kind={kind}
              item={selected}
              done={async () => {
                setSelected(undefined);
                invalidateCatalogCache();
                await resource.reload();
              }}
            />
          )}

          <ResourceState
            {...resource}
            empty={!resource.result?.data.length}
            retry={() => void resource.reload()}
          />

          <BentoGrid>
            {resource.result?.data.map((item) => (
              <View key={item.id} style={bento.cell(1, cols)}>
                <Card style={{ flex: 1, justifyContent: "space-between" }}>
                  <View style={{ gap: 6 }}>
                    <Copy size="subheading" weight="700">{item.name}</Copy>
                    <Copy muted size="small">{detail(item)}</Copy>
                  </View>
                  <Button
                    title={`Editar ${item.name}`}
                    secondary
                    onPress={() => setSelected(item)}
                  />
                </Card>
              </View>
            ))}
          </BentoGrid>
          <Pager pagination={resource.result?.pagination} onPage={setPage} />
        </>
      )}
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
  const validation = useForm();
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
    <Card variant="featured">
      <FormScope form={validation}>
      <Copy size="subheading" weight="700">{item ? `Editar ${item.name}` : "Nuevo registro"}</Copy>
      <Field
        label="Nombre"
        required
        // Ciudades: solo letras y espacios (igual que el backend); el resto de los catálogos admite puntuación (ej. "R&B").
        rules={kind === "cities" ? rules.city : rules.text(120)}
        value={form.name ?? ""}
        onChangeText={(v) => set("name", v)}
      />
      {kind === "provinces" && (
        <Field
          label="Código"
          required
          rules={[(value) => (/^[A-Z0-9-]{1,10}$/.test(value.trim()) ? null : "Usá mayúsculas, números o guiones (ej. AR-B).")]}
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
      <View style={styles.row}>
        <Button
          title="Guardar catálogo"
          disabled={action.busy}
          onPress={() =>
            void action.run(async () => {
              validation.assertValid();
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
              await api.request(`/${kind}${item ? `/${item.id}/update` : "/create"}`, {
                method: "POST",
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
                    await api.request(`/${kind}/${item.id}/delete`, {
                      method: "POST",
                    });
                    await done();
                  })
                : setConfirm(true)
            }
          />
        )}
        <Button title="Cerrar edición" secondary onPress={() => void done()} />
      </View>
      </FormScope>
    </Card>
  );
}
