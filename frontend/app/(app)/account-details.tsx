import { useEffect, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../src/contexts/AuthContext";
import { useResource } from "../../src/hooks/useResource";
import { api } from "../../src/services/api";
import type { Me } from "../../src/types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  FormScope,
  Notice,
  Page,
  ResourceState,
  SectionHeader,
  colors,
  styles,
  useAction,
  useForm,
} from "../../src/components/ui";

export default function AccountDetailsScreen() {
  const auth = useAuth();
  const saveAction = useAction();
  const form = useForm();
  const resource = useResource<Me>("/auth/me");
  const profile = resource.result?.data;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile?.user) {
      setFirstName(profile.user.first_name ?? "");
      setLastName(profile.user.last_name ?? "");
      setPhone(profile.user.phone ?? "");
    }
  }, [profile]);

  const save = () =>
    saveAction.run(async () => {
      form.assertValid();
      await api.request("/auth/me/update", {
        method: "POST",
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() ? phone.trim() : null,
        },
      });
      await resource.reload();
      saveAction.setMessage("Datos personales guardados correctamente.");
    });

  return (
    <Page
      eyebrow="VENTI · MI CUENTA"
      title="Datos personales"
      subtitle="Visualizá y actualizá tus datos personales de contacto."
      actions={
        <Button
          title="Volver a configuración"
          secondary
          onPress={() => router.back()}
        />
      }
    >
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {profile && (
        <View style={{ maxWidth: 640, width: "100%", gap: 16 }}>
          <Card variant="featured">
            <SectionHeader
              title="Información de la cuenta"
              subtitle="Email registrado y estado de la cuenta."
            />
            <View style={{ gap: 4, paddingVertical: 4 }}>
              <Copy muted size="small">CORREO ELECTRÓNICO (NO MODIFICABLE)</Copy>
              <Copy strong>{profile.user.email}</Copy>
            </View>
            <View
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Copy muted size="small">
                Para cambiar tu email o restablecer la contraseña, utilizá la sección de seguridad en la pantalla de configuración.
              </Copy>
            </View>
          </Card>

          <Card>
            <FormScope form={form}>
              <SectionHeader
                title="Editar datos de contacto"
                subtitle="Completá tus nombres y un teléfono para coordinar reservas o compras."
              />
              <View style={styles.row}>
                <Field
                  label="Nombre"
                  required
                  value={firstName}
                  onChangeText={setFirstName}
                  autoComplete="given-name"
                />
                <Field
                  label="Apellido"
                  required
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                />
              </View>
              <Field
                label="Teléfono"
                placeholder="+54 223 555-0100"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <ActionFeedback action={saveAction} />
              <Notice message={auth.error} error />
              <View style={[styles.row, { paddingTop: 8 }]}>
                <Button
                  title="Guardar cambios"
                  positive
                  disabled={saveAction.busy}
                  onPress={() => void save()}
                />
                <Button
                  title="Cancelar"
                  secondary
                  disabled={saveAction.busy}
                  onPress={() => router.back()}
                />
              </View>
            </FormScope>
          </Card>
        </View>
      )}
    </Page>
  );
}

