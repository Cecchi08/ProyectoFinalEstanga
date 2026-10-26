import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { PricingUnit, ServiceCategory, ServiceOffering, ServiceProvider } from "../../types/api";
import { ActionFeedback, Button, Card, Copy, Field, Notice, Page, ResourceState, dateLabel, styles, useAction } from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { Codes } from "../marketplace/MarketplaceScreen";
import { MembersPanel } from "../marketplace/ManageScreen";
import { OfferingCard, PRICING, PUBLICATION, ProviderCard } from "./ServicesScreen";

const text = (value?: string) => value?.trim() || null;
const PRICE = /^\d+(\.\d{1,2})?$/;

// GET /services/providers/mine: every company the account belongs to, in any state, with its member_role.
export default function MyProvidersScreen() {
  const mine = useResource<ServiceProvider[]>("/services/providers/mine");
  const [creating, setCreating] = useState(false);
  return (
    <Page title="Mis empresas de servicios" subtitle="Tu empresa, su catálogo y quiénes la operan. La publicás cuando esté lista.">
      <View style={styles.row}>
        <Button title={creating ? "Cerrar formulario" : "Nueva empresa de servicios"} onPress={() => setCreating(!creating)} />
        <Button title="Cotizaciones recibidas" secondary onPress={() => router.push("/services/quotes")} />
        <Button title="Ver catálogo público" secondary onPress={() => router.push("/services")} />
      </View>
      {creating && <ProviderForm done={async (saved) => { setCreating(false); router.push(`/services/providers/${saved.id}`); }} />}
      <ResourceState {...mine} empty={mine.result?.data.length === 0} retry={() => void mine.reload()} />
      <View style={[styles.row, { alignItems: "stretch" }]}>
        {mine.result?.data.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </View>
    </Page>
  );
}

// POST /services/providers (the creator becomes OWNER, the company starts as DRAFT) and PATCH /services/providers/:id.
function ProviderForm({ provider, done }: { provider?: ServiceProvider; done(saved: ServiceProvider): Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({
    name: provider?.name ?? "", legal_name: provider?.legal_name ?? "", email: provider?.email ?? "", phone: provider?.phone ?? "",
    description: provider?.description ?? "", coverage_area: provider?.coverage_area ?? "",
  });
  const [city, setCity] = useState<string[]>(provider?.city_id ? [provider.city_id] : []);
  const action = useAction();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => action.run(async () => {
    if (!form.name?.trim()) throw new Error("Poné el nombre de la empresa.");
    const body = {
      name: form.name.trim(), legal_name: text(form.legal_name), email: text(form.email), phone: text(form.phone),
      description: text(form.description), coverage_area: text(form.coverage_area), city_id: city[0] ?? null,
      // The CUIT is only sent when typed: the API does not return it, so an edit must not erase it.
      ...(form.tax_id?.trim() ? { tax_id: form.tax_id.trim() } : {}),
    };
    const { data } = await api.request<ServiceProvider>(provider ? `/services/providers/${provider.id}` : "/services/providers",
      { method: provider ? "PATCH" : "POST", body });
    await done(data);
  });
  return (
    <Card>
      <Copy>{provider ? "Datos de la empresa" : "Nueva empresa de servicios"}</Copy>
      {([["name", "Nombre comercial"], ["legal_name", "Razón social (opcional)"], ["tax_id", provider ? "CUIT (solo para cambiarlo)" : "CUIT (opcional)"],
        ["email", "Email de contacto (opcional)"], ["phone", "Teléfono (opcional)"], ["coverage_area", "Zona de cobertura (opcional)"]] as const).map(([key, label]) => (
        <Field key={key} label={label} value={form[key] ?? ""} onChangeText={(v) => set(key, v)} />
      ))}
      <Field label="Descripción (opcional)" multiline value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
      <Select label="Ciudad (opcional)" path="/cities" values={city} onChange={setCity} />
      <ActionFeedback action={action} />
      <Button title={provider ? "Guardar empresa" : "Crear empresa"} disabled={action.busy} onPress={() => void save()} />
    </Card>
  );
}

// POST /services/providers/:id/offerings (starts as DRAFT) and PATCH /services/offerings/:id. Without a list price the
// offering works only through quotes (pricing_unit QUOTE).
function OfferingForm({ providerId, offering, done }: { providerId: string; offering?: ServiceOffering; done(): Promise<void> }) {
  const categories = useResource<ServiceCategory[]>("/services/categories");
  const [form, setForm] = useState<Record<string, string>>({
    category_code: offering?.category_code ?? "", name: offering?.name ?? "", description: offering?.description ?? "",
    equipment: offering?.equipment ?? "", conditions: offering?.conditions ?? "", pricing_unit: offering?.pricing_unit ?? "QUOTE",
    base_price: offering?.base_price ?? "",
  });
  const action = useAction();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => action.run(async () => {
    const price = form.base_price?.trim() ?? "";
    if (!form.category_code) throw new Error("Elegí una categoría.");
    if (!form.name?.trim()) throw new Error("Poné el nombre del servicio.");
    if (price && !PRICE.test(price)) throw new Error("El precio es un número con hasta dos decimales, sin signo $.");
    if (!price && form.pricing_unit !== "QUOTE") throw new Error("Indicá el precio o elegí \"a cotizar\".");
    const body = {
      category_code: form.category_code, name: form.name.trim(), description: text(form.description), equipment: text(form.equipment),
      conditions: text(form.conditions), pricing_unit: form.pricing_unit, base_price: price ? Number(price) : null,
    };
    await api.request(offering ? `/services/offerings/${offering.id}` : `/services/providers/${providerId}/offerings`,
      { method: offering ? "PATCH" : "POST", body });
    await done();
  });
  return (
    <Card>
      <Copy>{offering ? `Editar ${offering.name}` : "Nuevo servicio"}</Copy>
      <Codes label="Categoría" items={categories.result?.data} values={form.category_code ? [form.category_code] : []}
        onChange={(v) => set("category_code", v[0] ?? "")} />
      <Field label="Nombre del servicio" value={form.name ?? ""} onChangeText={(v) => set("name", v)} />
      <Field label="Descripción (opcional)" multiline value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
      <Field label="Equipamiento (opcional)" multiline value={form.equipment ?? ""} onChangeText={(v) => set("equipment", v)} />
      <Field label="Condiciones (opcional)" multiline value={form.conditions ?? ""} onChangeText={(v) => set("conditions", v)} />
      <View style={styles.row}>
        {(Object.keys(PRICING) as PricingUnit[]).map((unit) => (
          <Button key={unit} title={`${form.pricing_unit === unit ? "✓ " : ""}${PRICING[unit]}`} secondary={form.pricing_unit !== unit}
            onPress={() => set("pricing_unit", unit)} />
        ))}
      </View>
      <Field label={form.pricing_unit === "QUOTE" ? "Precio de referencia (opcional)" : "Precio"} keyboardType="decimal-pad"
        value={form.base_price ?? ""} onChangeText={(v) => set("base_price", v)} />
      <ActionFeedback action={action} />
      <View style={styles.row}>
        <Button title={offering ? "Guardar servicio" : "Crear servicio"} disabled={action.busy} onPress={() => void save()} />
        <Button title="Cerrar" secondary onPress={() => void done()} />
      </View>
    </Card>
  );
}

// GET /services/providers/:id: public when published; members (and services.admin) also see drafts and archived offerings.
// OWNER/ADMIN edit, publish and manage the catalog and members; verifying is services.admin only and is audited.
export function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const resource = useResource<ServiceProvider>(`/services/providers/${id}`);
  const provider = resource.result?.data;
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [offering, setOffering] = useState<ServiceOffering | null | undefined>(undefined);
  const admin = can("services.admin");
  const manage = admin || (can("services.manage") && ["OWNER", "ADMIN"].includes(provider?.member_role ?? ""));
  const member = admin || Boolean(provider?.member_role);
  const run = (path: string, message: string) => action.run(async () => {
    await api.request(path, { method: "POST", body: {} });
    await resource.reload();
    action.setMessage(message);
  });
  return (
    <Page title={provider?.name ?? "Empresa de servicios"}
      subtitle={provider ? [provider.is_verified ? "✓ Verificada por Venti" : "Sin verificar", member ? PUBLICATION[provider.status] : ""].filter(Boolean).join(" · ") : undefined}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {provider && (
        <>
          <Card>
            {provider.description && <Copy>{provider.description}</Copy>}
            <Copy muted>{[provider.city_name, provider.coverage_area].filter(Boolean).join(" · ") || "Zona a consultar"}</Copy>
            {(provider.email || provider.phone) && <Copy muted>{[provider.email, provider.phone].filter(Boolean).join(" · ")}</Copy>}
            {provider.legal_name && <Copy muted>{provider.legal_name}</Copy>}
            {member && provider.organization_status !== "ACTIVE" && (
              <Notice message="La organización está suspendida: la empresa no aparece en el catálogo." error />
            )}
            {provider.verified_at && <Copy muted>Verificada {dateLabel(provider.verified_at)}</Copy>}
          </Card>
          {(manage || admin) && (
            <View style={styles.row}>
              {manage && provider.status !== "PUBLISHED" && (
                <Button title="Publicar empresa" disabled={action.busy} onPress={() => void run(`/services/providers/${id}/publish`, "Empresa publicada.")} />
              )}
              {manage && provider.status !== "ARCHIVED" && (
                <Button title="Archivar empresa" secondary danger disabled={action.busy}
                  onPress={() => void run(`/services/providers/${id}/archive`, "Empresa archivada.")} />
              )}
              {manage && <Button title={editing ? "Cerrar edición" : "Editar datos"} secondary onPress={() => setEditing(!editing)} />}
              {admin && (
                <Button title={provider.is_verified ? "Quitar verificación" : "Verificar empresa"} secondary disabled={action.busy}
                  onPress={() => void run(`/services/providers/${id}/${provider.is_verified ? "unverify" : "verify"}`,
                    provider.is_verified ? "Verificación quitada." : "Empresa verificada.")} />
              )}
            </View>
          )}
          {editing && manage && (
            <ProviderForm provider={provider} done={async () => { setEditing(false); await resource.reload(); action.setMessage("Empresa guardada."); }} />
          )}
          <Copy>Servicios</Copy>
          {manage && offering === undefined && <Button title="Nuevo servicio" onPress={() => setOffering(null)} />}
          {manage && offering !== undefined && (
            <OfferingForm key={offering?.id ?? "new"} providerId={provider.id} offering={offering ?? undefined}
              done={async () => { setOffering(undefined); await resource.reload(); }} />
          )}
          {!provider.offerings?.length && <Copy muted>Todavía no hay servicios publicados.</Copy>}
          <View style={[styles.row, { alignItems: "stretch" }]}>
            {provider.offerings?.map((item) => (
              <View key={item.id} style={{ flexGrow: 1, flexBasis: 300, maxWidth: 560, gap: 6 }}>
                <OfferingCard offering={item} manage={member} />
                {manage && (
                  <View style={styles.row}>
                    <Button title={`Editar ${item.name}`} secondary onPress={() => setOffering(item)} />
                    {item.status !== "PUBLISHED" ? (
                      <Button title={`Publicar ${item.name}`} secondary disabled={action.busy}
                        onPress={() => void run(`/services/offerings/${item.id}/publish`, "Servicio publicado.")} />
                    ) : (
                      <Button title={`Archivar ${item.name}`} secondary danger disabled={action.busy}
                        onPress={() => void run(`/services/offerings/${item.id}/archive`, "Servicio archivado.")} />
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
          {member && can("services.manage", "services.admin") && (
            <MembersPanel organization={provider} path={`/services/providers/${provider.id}/members`} profile="EMPRESA_SERVICIOS" admin={admin} />
          )}
          {member && <Button title="Cotizaciones recibidas" secondary onPress={() => router.push("/services/quotes")} />}
        </>
      )}
      <Button title="Volver a servicios" secondary onPress={() => router.push("/services")} />
    </Page>
  );
}
