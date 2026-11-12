// Pantalla de administración de promociones y cupones de descuento para Venti.
import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useResource } from "../../hooks/useResource";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { api } from "../../services/api";
import { query } from "../../services/http";
import type { AdminPromotion } from "../../types/api";
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
  SectionHeader,
  colors,
  dateLabel,
  money,
  styles,
  useAction,
  useBento,
  useForm,
} from "../../components/ui";
import { TagIcon } from "../../components/ui/icons";

const PROMO_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activa",
  INACTIVE: "Inactiva",
  EXPIRED: "Vencida",
};

interface FormState {
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string;
  minOrderAmount: string;
  concertId: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
}

const defaultForm: FormState = {
  code: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "10.00",
  minOrderAmount: "0.00",
  concertId: "",
  maxUses: "",
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
};

export default function PromotionsAdminScreen() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [editingPromo, setEditingPromo] = useState<AdminPromotion | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<FormState>(defaultForm);

  const action = useAction();
  const createForm = useForm();
  const editForm = useForm();
  const bento = useBento();
  const cols = bento.cols;

  const filterQuery = query({
    page,
    q: debouncedSearch.trim() || undefined,
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });

  // Carga de listado de cupones vía endpoint administrativo.
  const resource = useResource<AdminPromotion[]>(
    can("orders.read_all", "catalogs.manage") ? `/admin/promotions${filterQuery}` : null,
  );

  const promos = resource.result?.data ?? [];

  const openCreate = () => {
    setEditingPromo(null);
    createForm.reset();
    setFormData(defaultForm);
    setIsCreating(true);
  };

  const openEdit = (promo: AdminPromotion) => {
    setIsCreating(false);
    editForm.reset();
    setEditingPromo(promo);
    setFormData({
      code: promo.code,
      description: promo.description,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      minOrderAmount: promo.min_order_amount,
      concertId: promo.concert_id || "",
      maxUses: promo.max_uses ? String(promo.max_uses) : "",
      validFrom: promo.valid_from ? new Date(promo.valid_from).toISOString().slice(0, 10) : "",
      validUntil: promo.valid_until ? new Date(promo.valid_until).toISOString().slice(0, 10) : "",
    });
  };

  // Creación de cupón vía API con validación de campos y manejo de errores.
  const handleCreate = () =>
    action.run(async () => {
      createForm.assertValid();
      if (!formData.code.trim()) throw new Error("Ingresá el código promocional.");
      if (!formData.description.trim()) throw new Error("Ingresá una descripción para el cupón.");
      const val = Number(formData.discountValue);
      if (isNaN(val) || val <= 0) throw new Error("El valor del descuento debe ser mayor a 0.");
      if (formData.discountType === "PERCENTAGE" && val > 100)
        throw new Error("El porcentaje de descuento no puede superar el 100%.");

      const body = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        discountType: formData.discountType,
        discountValue: val,
        minOrderAmount: Number(formData.minOrderAmount || 0),
        concertId: formData.concertId.trim() || null,
        maxUses: formData.maxUses.trim() ? Number(formData.maxUses) : null,
        validFrom: new Date(formData.validFrom).toISOString(),
        validUntil: new Date(`${formData.validUntil}T23:59:59.000Z`).toISOString(),
      };

      await api.request("/admin/promotions/create", {
        method: "POST",
        body,
      });

      createForm.reset();
      setIsCreating(false);
      setFormData(defaultForm);
      action.setMessage("Promoción creada con éxito.");
      await resource.reload();
    });

  // Actualización de cupón existente.
  const handleUpdate = (id: string) =>
    action.run(async () => {
      editForm.assertValid();
      if (!formData.description.trim()) throw new Error("Ingresá una descripción para el cupón.");
      const body = {
        description: formData.description.trim(),
        status: editingPromo?.status,
        maxUses: formData.maxUses.trim() ? Number(formData.maxUses) : null,
        validUntil: new Date(`${formData.validUntil}T23:59:59.000Z`).toISOString(),
      };

      await api.request(`/admin/promotions/${id}/update`, {
        method: "POST",
        body,
      });

      editForm.reset();
      setEditingPromo(null);
      action.setMessage("Promoción actualizada con éxito.");
      await resource.reload();
    });

  // Alternar estado activo / inactivo.
  const handleToggleStatus = (promo: AdminPromotion) =>
    action.run(async () => {
      const nextStatus = promo.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.request(`/admin/promotions/${promo.id}/update`, {
        method: "POST",
        body: { status: nextStatus },
      });
      action.setMessage(`Promoción ${nextStatus === "ACTIVE" ? "activada" : "desactivada"}.`);
      await resource.reload();
    });

  // Eliminación o desactivación de cupón.
  const handleDelete = (promo: AdminPromotion) =>
    action.run(async () => {
      const res = await api.request<{ deleted: boolean; deactivated: boolean }>(`/admin/promotions/${promo.id}/delete`, {
        method: "POST",
      });
      await resource.reload();
      action.setMessage(
        res.data?.deleted
          ? "Promoción eliminada definitivamente."
          : "Promoción con redenciones históricas desactivada.",
      );
    });

  return (
    <Page
      eyebrow="VENTI · ADMINISTRACIÓN"
      title="Promociones y Descuentos"
      subtitle="Administración de códigos de descuento, vigencia, topes de uso y asignación por concierto."
    >
      <ActionFeedback action={action} />

      <Card variant="featured">
        <View style={styles.between}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TagIcon size={20} color={colors.accent} />
              <Copy size="subheading" weight="700">Gestión de Cupones</Copy>
            </View>
            <Copy muted>
              Creá códigos con porcentaje o monto fijo, asignados a un concierto específico o para toda la plataforma.
            </Copy>
          </View>
          <Button title="+ Crear Promoción" onPress={openCreate} />
        </View>

        <View style={[styles.row, { marginTop: 12 }]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field
              label="Buscar cupón"
              placeholder="Código o descripción..."
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
          </View>
        </View>

        <View style={{ marginTop: 8, gap: 6 }}>
          <Copy size="label" muted>Filtrar por estado:</Copy>
          <View style={styles.row}>
            {(["ALL", "ACTIVE", "INACTIVE", "EXPIRED"] as const).map((s) => (
              <Button
                key={s}
                title={s === "ALL" ? "Todas" : PROMO_STATUS_LABELS[s]}
                secondary={statusFilter !== s}
                onPress={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
              />
            ))}
          </View>
        </View>
      </Card>

      {/* Formulario de creación de cupón con validación */}
      {isCreating && (
        <Card variant="subtle">
          <SectionHeader
            title="Nueva Promoción"
            icon={<TagIcon size={18} color={colors.text} />}
            subtitle="Ingresá los datos del cupón. El código se guardará en mayúsculas sin espacios."
          />
          <FormScope form={createForm}>
            <View style={{ gap: 10 }}>
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 150 }}>
                  <Field
                    label="Código"
                    required
                    placeholder="Ej: TESTVENTI"
                    value={formData.code}
                    autoCapitalize="characters"
                    onChangeText={(v) => setFormData({ ...formData, code: v.toUpperCase() })}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 150 }}>
                  <Copy size="label" muted style={{ marginBottom: 4 }}>Tipo de Descuento</Copy>
                  <View style={styles.row}>
                    <Button
                      title="Porcentaje (%)"
                      secondary={formData.discountType !== "PERCENTAGE"}
                      onPress={() => setFormData({ ...formData, discountType: "PERCENTAGE" })}
                    />
                    <Button
                      title="Monto Fijo ($)"
                      secondary={formData.discountType !== "FIXED"}
                      onPress={() => setFormData({ ...formData, discountType: "FIXED" })}
                    />
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <Field
                    label={formData.discountType === "PERCENTAGE" ? "Porcentaje (%)" : "Importe ($)"}
                    required
                    placeholder="Ej: 10.00"
                    value={formData.discountValue}
                    onChangeText={(v) => setFormData({ ...formData, discountValue: v })}
                  />
                </View>
              </View>

              <Field
                label="Descripción pública"
                required
                placeholder="Ej: 10% de descuento en la compra de entradas para conciertos seleccionados"
                value={formData.description}
                onChangeText={(v) => setFormData({ ...formData, description: v })}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Compra mínima ($)"
                    placeholder="0.00 para sin mínimo"
                    value={formData.minOrderAmount}
                    onChangeText={(v) => setFormData({ ...formData, minOrderAmount: v })}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Límite máx. usos"
                    placeholder="Vacío para ilimitado"
                    value={formData.maxUses}
                    onChangeText={(v) => setFormData({ ...formData, maxUses: v })}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="ID Concierto (opcional)"
                    placeholder="Vacío para todos"
                    value={formData.concertId}
                    onChangeText={(v) => setFormData({ ...formData, concertId: v })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Válido desde (AAAA-MM-DD)"
                    required
                    placeholder="2026-01-01"
                    value={formData.validFrom}
                    onChangeText={(v) => setFormData({ ...formData, validFrom: v })}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Válido hasta (AAAA-MM-DD)"
                    required
                    placeholder="2027-12-31"
                    value={formData.validUntil}
                    onChangeText={(v) => setFormData({ ...formData, validUntil: v })}
                  />
                </View>
              </View>

              <View style={[styles.row, { justifyContent: "flex-end", marginTop: 8 }]}>
                <Button title="Cancelar" secondary onPress={() => setIsCreating(false)} />
                <Button title="Guardar Cupón" onPress={handleCreate} disabled={action.busy} />
              </View>
            </View>
          </FormScope>
        </Card>
      )}

      {/* Formulario de edición */}
      {editingPromo && (
        <Card variant="subtle">
          <SectionHeader
            title={`Editar Cupón: ${editingPromo.code}`}
            icon={<TagIcon size={18} color={colors.text} />}
            subtitle="Modificá la descripción, fecha de expiración o límite de usos."
          />
          <FormScope form={editForm}>
            <View style={{ gap: 10 }}>
              <Field
                label="Descripción"
                required
                value={formData.description}
                onChangeText={(v) => setFormData({ ...formData, description: v })}
              />
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Límite máx. usos"
                    placeholder="Vacío para ilimitado"
                    value={formData.maxUses}
                    onChangeText={(v) => setFormData({ ...formData, maxUses: v })}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label="Válido hasta (AAAA-MM-DD)"
                    required
                    value={formData.validUntil}
                    onChangeText={(v) => setFormData({ ...formData, validUntil: v })}
                  />
                </View>
              </View>
              <View style={[styles.row, { justifyContent: "flex-end", marginTop: 8 }]}>
                <Button title="Cancelar" secondary onPress={() => setEditingPromo(null)} />
                <Button title="Actualizar" onPress={() => handleUpdate(editingPromo.id)} disabled={action.busy} />
              </View>
            </View>
          </FormScope>
        </Card>
      )}

      <ResourceState {...resource} empty={promos.length === 0} retry={() => void resource.reload()} />

      {promos.length > 0 && (
        <BentoGrid>
          {promos.map((promo) => {
            const isActive = promo.status === "ACTIVE";
            const isExpired = promo.status === "EXPIRED";
            return (
              <View key={promo.id} style={[bento.cell(1, cols), { gap: 8 }]}>
                <Card>
                  <View style={styles.between}>
                    <View style={{ gap: 2 }}>
                      <Copy size="subheading" weight="700" color={colors.accent}>
                        {promo.code}
                      </Copy>
                      <Copy size="small" muted>
                        {promo.discount_type === "PERCENTAGE"
                          ? `${promo.discount_value}% OFF`
                          : `${money(promo.discount_value)} OFF`}
                        {Number(promo.min_order_amount) > 0 ? ` · Mín. ${money(promo.min_order_amount)}` : ""}
                      </Copy>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isActive
                            ? colors.primarySoft
                            : isExpired
                              ? colors.dangerSoft
                              : colors.surfaceAlt,
                          borderColor: isActive
                            ? colors.primary
                            : isExpired
                              ? colors.dangerBorder
                              : colors.border,
                        },
                      ]}
                    >
                      <Copy
                        size="label"
                        color={
                          isActive
                            ? colors.accent
                            : isExpired
                              ? colors.dangerText
                              : colors.muted
                        }
                        weight="700"
                      >
                        {PROMO_STATUS_LABELS[promo.status] || promo.status}
                      </Copy>
                    </View>
                  </View>

                  <Copy>{promo.description}</Copy>

                  <View style={{ gap: 2, paddingVertical: 4 }}>
                    <Copy size="small" muted>
                      Usos: <Copy strong size="small">{promo.current_uses}</Copy>
                      {promo.max_uses != null ? ` / ${promo.max_uses}` : " (sin tope)"}
                    </Copy>
                    {promo.concert_id ? (
                      <Copy size="small" muted>
                        Concierto: {promo.concert_title ? promo.concert_title : `ID #${promo.concert_id}`}
                      </Copy>
                    ) : (
                      <Copy size="small" muted>Aplica a: Todos los conciertos</Copy>
                    )}
                    <Copy size="small" muted>
                      Vigencia: {dateLabel(promo.valid_from)} al {dateLabel(promo.valid_until)}
                    </Copy>
                  </View>

                  <View style={[styles.row, { marginTop: 6, gap: 8 }]}>
                    <Button title="Editar" secondary onPress={() => openEdit(promo)} />
                    <Button
                      title={isActive ? "Desactivar" : "Activar"}
                      secondary
                      onPress={() => handleToggleStatus(promo)}
                    />
                    <Button
                      title="Eliminar"
                      secondary
                      onPress={() => handleDelete(promo)}
                    />
                  </View>
                </Card>
              </View>
            );
          })}
        </BentoGrid>
      )}

      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
