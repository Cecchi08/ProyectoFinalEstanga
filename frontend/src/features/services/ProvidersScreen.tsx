import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import type { PricingUnit, ServiceCategory, ServiceOffering, ServiceProvider } from "../../types/api";
import {
  ActionFeedback,
  BentoGrid,
  Button,
  Card,
  Copy,
  Field,
  FormScope,
  MusicalCover,
  Notice,
  Page,
  ResourceState,
  SectionHeader,
  dateLabel,
  styles,
  useAction,
  useBento,
  useForm,
} from "../../components/ui";
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
    <Page
      eyebrow="VENTI · EMPRESA DE SERVICIOS"
      title="Panel de Empresa de Servicios"
      subtitle="Administrá el perfil de tu empresa, tu catálogo de servicios técnicos y las cotizaciones recibidas."
      actions={
        <>
          <Button title={creating ? "Cerrar formulario" : "Nueva empresa de servicios"} onPress={() => setCreating(!creating)} />
          <Button title="Cotizaciones recibidas" secondary onPress={() => router.push("/services/quotes")} />
          <Button title="Ver catálogo público" secondary onPress={() => router.push("/services")} />
        </>
      }
    >
      {creating && <ProviderForm done={async (saved) => { setCreating(false); router.push(`/services/providers/${saved.id}`); }} />}
      <ResourceState {...mine} empty={mine.result?.data.length === 0} retry={() => void mine.reload()} />
      <BentoGrid>
        {mine.result?.data.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </BentoGrid>
    </Page>
  );
}

// POST /services/providers (the creator becomes OWNER, the company starts as DRAFT) and PATCH /services/providers/:id.
function ProviderForm({ provider, done }: { provider?: ServiceProvider; done(saved: ServiceProvider): Promise<void> }) {
  const categories = useResource<ServiceCategory[]>("/services/categories");
  const [form, setForm] = useState<Record<string, string>>({
    name: provider?.name ?? "",
    legal_name: provider?.legal_name ?? "",
    email: provider?.email ?? "",
    phone: provider?.phone ?? "",
    description: provider?.description ?? "",
    coverage_area: provider?.coverage_area ?? "",
    logo_url: provider?.logo_url ?? "",
    primary_category_code: provider?.primary_category_code ?? "",
  });
  const [city, setCity] = useState<string[]>(provider?.city_id ? [provider.city_id] : []);
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => action.run(async () => {
    validation.assertValid();
    if (!form.name?.trim()) throw new Error("Poné el nombre de la empresa.");
    const body = {
      name: form.name.trim(),
      legal_name: text(form.legal_name),
      email: text(form.email),
      phone: text(form.phone),
      description: text(form.description),
      coverage_area: text(form.coverage_area),
      logo_url: text(form.logo_url),
      primary_category_code: text(form.primary_category_code),
      city_id: city[0] ?? null,
      // The CUIT is only sent when typed: the API does not return it, so an edit must not erase it.
      ...(form.tax_id?.trim() ? { tax_id: form.tax_id.trim() } : {}),
    };
    const { data } = await api.request<ServiceProvider>(provider ? `/services/providers/${provider.id}/update` : "/services/providers/create",
      { method: "POST", body });
    await done(data);
  });
  return (
    <Card variant="featured">
      <FormScope form={validation}>
        <SectionHeader
          title={provider ? "Editar perfil de la empresa" : "Registrar nueva empresa de servicios"}
          subtitle="Completá los datos institucionales, categoría principal, contacto y logo."
        />
        <View style={styles.row}>
          <Field label="Nombre de la empresa" required value={form.name ?? ""} onChangeText={(v) => set("name", v)} />
          <Field label="Razón social (opcional)" value={form.legal_name ?? ""} onChangeText={(v) => set("legal_name", v)} />
        </View>
        <Codes
          label="Categoría principal"
          items={categories.result?.data}
          values={form.primary_category_code ? [form.primary_category_code] : []}
          onChange={(v) => set("primary_category_code", v[0] ?? "")}
        />
        <View style={styles.row}>
          <Field label="Correo electrónico de contacto" keyboardType="email-address" value={form.email ?? ""} onChangeText={(v) => set("email", v)} />
          <Field label="Teléfono de contacto" keyboardType="phone-pad" value={form.phone ?? ""} onChangeText={(v) => set("phone", v)} />
        </View>
        <View style={styles.row}>
          <Field label={provider ? "CUIT (solo para cambiarlo)" : "CUIT (opcional)"} value={form.tax_id ?? ""} onChangeText={(v) => set("tax_id", v)} />
          <Field label="Zona de cobertura / Ubicación" value={form.coverage_area ?? ""} onChangeText={(v) => set("coverage_area", v)} />
        </View>
        <Field label="URL de imagen o logo (https://...)" value={form.logo_url ?? ""} onChangeText={(v) => set("logo_url", v)} />
        <Field label="Descripción de la empresa" multiline value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
        <Select label="Ciudad base" path="/cities" values={city} onChange={setCity} />
        <ActionFeedback action={action} />
        <Button title={provider ? "Guardar perfil de empresa" : "Crear empresa"} disabled={action.busy} onPress={() => void save()} />
      </FormScope>
    </Card>
  );
}

// POST /services/providers/:id/offerings (starts as DRAFT) and PATCH /services/offerings/:id.
function OfferingForm({ providerId, offering, done }: { providerId: string; offering?: ServiceOffering; done(): Promise<void> }) {
  const categories = useResource<ServiceCategory[]>("/services/categories");
  const [form, setForm] = useState<Record<string, string>>({
    category_code: offering?.category_code ?? "",
    name: offering?.name ?? "",
    description: offering?.description ?? "",
    equipment: offering?.equipment ?? "",
    conditions: offering?.conditions ?? "",
    pricing_unit: offering?.pricing_unit ?? "QUOTE",
    base_price: offering?.base_price ?? "",
    image_url: offering?.image_url ?? "",
  });
  const action = useAction();
  const validation = useForm();
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => action.run(async () => {
    validation.assertValid();
    const price = form.base_price?.trim() ?? "";
    if (!form.category_code) throw new Error("Elegí una categoría.");
    if (!form.name?.trim()) throw new Error("Poné el nombre del servicio.");
    if (price && !PRICE.test(price)) throw new Error("El precio es un número con hasta dos decimales, sin signo $.");
    if (!price && form.pricing_unit !== "QUOTE") throw new Error("Indicá el precio o elegí \"a cotizar\".");
    const body = {
      category_code: form.category_code,
      name: form.name.trim(),
      description: text(form.description),
      equipment: text(form.equipment),
      conditions: text(form.conditions),
      pricing_unit: form.pricing_unit,
      base_price: price ? Number(price) : null,
      image_url: text(form.image_url),
    };
    await api.request(offering ? `/services/offerings/${offering.id}/update` : `/services/providers/${providerId}/offerings/create`,
      { method: "POST", body });
    await done();
  });
  return (
    <Card variant="subtle">
      <FormScope form={validation}>
        <SectionHeader
          title={offering ? `Editar servicio: ${offering.name}` : "Nuevo servicio del catálogo"}
          subtitle="Definí el alcance técnico, el equipamiento incluido y la modalidad de contratación."
        />
        <Codes label="Categoría del servicio" items={categories.result?.data} values={form.category_code ? [form.category_code] : []}
          onChange={(v) => set("category_code", v[0] ?? "")} />
        <Field label="Nombre del servicio" required value={form.name ?? ""} onChangeText={(v) => set("name", v)} />
        <Field label="Descripción y alcance" multiline value={form.description ?? ""} onChangeText={(v) => set("description", v)} />
        <View style={styles.row}>
          <Field label="Equipamiento incluido (opcional)" multiline value={form.equipment ?? ""} onChangeText={(v) => set("equipment", v)} />
          <Field label="Condiciones operativas (opcional)" multiline value={form.conditions ?? ""} onChangeText={(v) => set("conditions", v)} />
        </View>
        <Field label="URL de imagen del servicio (opcional)" value={form.image_url ?? ""} onChangeText={(v) => set("image_url", v)} />
        <View style={styles.row}>
          {(Object.keys(PRICING) as PricingUnit[]).map((unit) => (
            <Button key={unit} title={`${form.pricing_unit === unit ? "✓ " : ""}${PRICING[unit]}`} secondary={form.pricing_unit !== unit}
              onPress={() => set("pricing_unit", unit)} />
          ))}
        </View>
        <Field label={form.pricing_unit === "QUOTE" ? "Precio de referencia (opcional)" : "Precio"} required={form.pricing_unit !== "QUOTE"} keyboardType="decimal-pad"
          value={form.base_price ?? ""} onChangeText={(v) => set("base_price", v)} />
        <ActionFeedback action={action} />
        <View style={styles.row}>
          <Button title={offering ? "Guardar servicio" : "Crear servicio"} disabled={action.busy} onPress={() => void save()} />
          <Button title="Cerrar" secondary onPress={() => void done()} />
        </View>
      </FormScope>
    </Card>
  );
}

// GET /services/providers/:id: public when published; members (and services.admin) also see drafts and archived offerings.
export function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const { mobile } = useBento();
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
    <Page
      eyebrow="VENTI · EMPRESA DE SERVICIOS"
      title={provider?.name ?? "Empresa de servicios"}
      subtitle={provider ? [provider.is_verified ? "✓ Verificada por Venti" : "Sin verificar", member ? PUBLICATION[provider.status] : ""].filter(Boolean).join(" · ") : undefined}
      actions={
        <>
          {member && <Button title="Cotizaciones recibidas" secondary onPress={() => router.push("/services/quotes")} />}
          <Button title="Volver a servicios" secondary onPress={() => router.push("/services")} />
        </>
      }
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      <ActionFeedback action={action} />
      {provider && (
        <>
          <SectionHeader
            title="1. Perfil de la Empresa"
            subtitle="Datos institucionales, categoría principal, ubicación y canales de contacto."
          />
          <BentoGrid style={{ alignItems: "flex-start" }}>
            <View
              style={{
                flexGrow: 2,
                flexShrink: 1,
                minWidth: 0,
                flexBasis: mobile ? "auto" : 480,
                width: mobile ? "100%" : undefined,
                maxWidth: "100%",
                gap: 16,
              }}
            >
              <Card variant="featured">
                <MusicalCover
                  uri={provider.logo_url}
                  alt={provider.name}
                  kind="service"
                  height={190}
                  badge={provider.primary_category_name ?? "Empresa de servicios"}
                  subBadge={provider.is_verified ? "VERIFICADA" : PUBLICATION[provider.status]}
                />
                {provider.primary_category_name ? (
                  <Copy strong>Categoría principal: {provider.primary_category_name}</Copy>
                ) : null}
                {provider.description && <Copy>{provider.description}</Copy>}
                <Copy muted>Ubicación y cobertura: {[provider.city_name, provider.coverage_area].filter(Boolean).join(" · ") || "Zona a consultar"}</Copy>
                {provider.email && <Copy muted>Correo electrónico: {provider.email}</Copy>}
                {provider.phone && <Copy muted>Teléfono: {provider.phone}</Copy>}
                {provider.legal_name && <Copy muted>Razón social: {provider.legal_name}</Copy>}
                {member && provider.organization_status !== "ACTIVE" && (
                  <Notice message="La organización está suspendida: la empresa no aparece en el catálogo." tone="warning" />
                )}
                {provider.verified_at && <Copy muted>Verificada {dateLabel(provider.verified_at)}</Copy>}
                {(manage || admin) && (
                  <View style={styles.row}>
                    {manage && provider.status !== "PUBLISHED" && (
                      <Button title="Publicar empresa" disabled={action.busy} onPress={() => void run(`/services/providers/${id}/publish`, "Empresa publicada.")} />
                    )}
                    {manage && provider.status !== "ARCHIVED" && (
                      <Button title="Desactivar / Archivar empresa" secondary danger disabled={action.busy}
                        onPress={() => void run(`/services/providers/${id}/archive`, "Empresa archivada.")} />
                    )}
                    {manage && <Button title={editing ? "Cerrar edición" : "Editar perfil de empresa"} secondary onPress={() => setEditing(!editing)} />}
                    {admin && (
                      <Button title={provider.is_verified ? "Quitar verificación" : "Verificar empresa"} secondary disabled={action.busy}
                        onPress={() => void run(`/services/providers/${id}/${provider.is_verified ? "unverify" : "verify"}`,
                          provider.is_verified ? "Verificación quitada." : "Empresa verificada.")} />
                    )}
                  </View>
                )}
              </Card>
              {editing && manage && (
                <ProviderForm provider={provider} done={async () => { setEditing(false); await resource.reload(); action.setMessage("Perfil de empresa guardado."); }} />
              )}
            </View>

            {member && can("services.manage", "services.admin") && (
              <View
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  flexBasis: mobile ? "auto" : 380,
                  width: mobile ? "100%" : undefined,
                  maxWidth: "100%",
                }}
              >
                <MembersPanel organization={provider} path={`/services/providers/${provider.id}/members`} profile="EMPRESA_SERVICIOS" admin={admin} />
              </View>
            )}
          </BentoGrid>

          <SectionHeader
            title="2. Administración de Servicios"
            subtitle="Creá, editá, activá o desactivá los servicios ofrecidos por esta empresa."
            action={manage && offering === undefined ? <Button title="Nuevo servicio" onPress={() => setOffering(null)} /> : undefined}
          />
          {manage && offering !== undefined && (
            <OfferingForm key={offering?.id ?? "new"} providerId={provider.id} offering={offering ?? undefined}
              done={async () => { setOffering(undefined); await resource.reload(); }} />
          )}
          {!provider.offerings?.length && (
            <Card variant="subtle">
              <Copy muted>Todavía no hay servicios registrados en esta empresa.</Copy>
            </Card>
          )}
          <BentoGrid>
            {provider.offerings?.map((item) => (
              <OfferingCard
                key={item.id}
                offering={item}
                manage={member}
                footerActions={
                  manage ? (
                    <>
                      <Button title={`Editar ${item.name}`} secondary onPress={() => setOffering(item)} />
                      {item.status !== "PUBLISHED" ? (
                        <Button
                          title={`Activar / Publicar`}
                          secondary
                          disabled={action.busy}
                          onPress={() => void run(`/services/offerings/${item.id}/publish`, "Servicio activado y publicado.")}
                        />
                      ) : (
                        <Button
                          title={`Desactivar / Archivar`}
                          secondary
                          danger
                          disabled={action.busy}
                          onPress={() => void run(`/services/offerings/${item.id}/archive`, "Servicio desactivado.")}
                        />
                      )}
                    </>
                  ) : undefined
                }
              />
            ))}
          </BentoGrid>
        </>
      )}
    </Page>
  );
}
