import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../../services/api";
import { ApiError } from "../../services/http";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  Notice,
  Page,
  Pager,
  ResourceState,
  SectionHeader,
  dateLabel,
  radius,
  statusLabel,
  styles,
  useBento,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { useAuth } from "../../contexts/AuthContext";
import type { Concert, Attendee } from "../../types/api";
import { scanMessage } from "./validation";
import { notifyTicketValidated } from "../tickets/ticketEvents";

// Pantalla de control de acceso para personal Staff: selección de concierto y escaneo QR.
export default function StaffScreen() {
  const { can } = useAuth();
  const { mobile } = useBento();
  // Página de conciertos asignados.
  const [page, setPage] = useState(1);
  // Concierto seleccionado actualmente para validar entradas.
  const [selected, setSelected] = useState<Concert | null>(null);
  // Página de asistentes del concierto seleccionado.
  const [attendeePage, setAttendeePage] = useState(1);
  // Carga conciertos asignados al staff cuando no hay uno seleccionado.
  const assignments = useResource<Concert[]>(
    selected ? null : `/staff/assignments?page=${page}`,
  );
  // Carga listado de asistentes del concierto seleccionado.
  const attendees = useResource<Attendee[]>(
    selected ? `/concerts/${selected.id}/attendees?page=${attendeePage}` : null,
  );
  return (
    <Page
      eyebrow="VENTI · PUERTA Y VALIDACIÓN QR"
      title="Control de acceso"
      subtitle={
        can("tickets.validate_all")
          ? "Seleccioná un concierto para gestionar el ingreso."
          : "Seleccioná uno de tus conciertos asignados."
      }
      actions={
        !selected ? (
          <Button
            title="Actualizar conciertos"
            secondary
            onPress={() => void assignments.reload()}
          />
        ) : (
          <Button
            title="Cambiar concierto"
            secondary
            onPress={() => setSelected(null)}
          />
        )
      }
    >
      {!selected ? (
        <>
          <ResourceState
            {...assignments}
            empty={assignments.result?.data.length === 0}
            retry={() => void assignments.reload()}
          />
          <BentoGrid>
            {assignments.result?.data.map((concert) => (
              <View
                key={concert.id}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  flexBasis: mobile ? "auto" : 340,
                  width: mobile ? "100%" : undefined,
                  maxWidth: "100%",
                }}
              >
                <Card style={{ flexGrow: 1, justifyContent: "space-between" }}>
                  <View style={{ gap: 6 }}>
                    <Copy strong>{concert.name}</Copy>
                    <Copy muted>
                      {dateLabel(concert.start_datetime)} · {concert.venue_name} ·{" "}
                      {statusLabel(concert.status)}
                    </Copy>
                  </View>
                  <Button
                    title={`Seleccionar ${concert.name}`}
                    onPress={() => {
                      setAttendeePage(1);
                      setSelected(concert);
                    }}
                  />
                </Card>
              </View>
            ))}
          </BentoGrid>
          <Pager pagination={assignments.result?.pagination} onPage={setPage} />
        </>
      ) : (
        <BentoGrid style={{ alignItems: "flex-start" }}>
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 420,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 16,
            }}
          >
            <Card variant="subtle">
              <Copy strong>{selected.name}</Copy>
              <Copy muted>
                {dateLabel(selected.start_datetime)} · {selected.venue_name} ·{" "}
                {statusLabel(selected.status)}
              </Copy>
            </Card>
            <Scanner
              key={selected.id}
              concert={selected.id}
            />
          </View>

          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 460,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
              gap: 14,
            }}
          >
            <Card variant="subtle">
              <SectionHeader
                title="Asistentes"
                subtitle="Una fila por entrada emitida. El nombre corresponde al comprador."
                action={
                  <Button
                    title="Actualizar asistentes"
                    secondary
                    onPress={() => void attendees.reload()}
                  />
                }
              />
            </Card>
            <ResourceState
              {...attendees}
              empty={attendees.result?.data.length === 0}
              retry={() => void attendees.reload()}
            />
            {attendees.result?.data.map((attendee) => (
              <Card key={attendee.ticket_id}>
                <Copy strong>
                  {attendee.first_name} {attendee.last_name}
                </Copy>
                <Copy>
                  Entrada: {attendee.ticket_type_name} ·{" "}
                  {statusLabel(attendee.status)}
                </Copy>
                <Copy muted>
                  Compra: {statusLabel(attendee.purchase_status)}
                  {attendee.used_at
                    ? ` · Ingresó ${dateLabel(attendee.used_at)}`
                    : ""}
                </Copy>
              </Card>
            ))}
            <Pager
              pagination={attendees.result?.pagination}
              onPage={setAttendeePage}
            />
          </View>
        </BentoGrid>
      )}
    </Page>
  );
}

// Subcomponente encargado exclusivamente del escaneo de códigos QR por cámara.
function Scanner({
  concert,
}: {
  concert: string;
}) {
  // Estado de permisos de cámara del dispositivo/navegador.
  const [permission, requestPermission] = useCameraPermissions();
  // Controla si el visor de cámara está abierto.
  const [camera, setCamera] = useState(false);
  // Mensaje legible del último escaneo o error.
  const [result, setResult] = useState("");
  // Indica si la última validación fue exitosa (VALID).
  const [valid, setValid] = useState(false);
  // Bloqueo visual mientras se consulta al backend.
  const [busy, setBusy] = useState(false);
  // Lock sincrónico para evitar múltiples envíos por lecturas consecutivas del mismo QR.
  const locked = useRef(false);

  useEffect(() => {
    return () => {
      // Liberar recursos de cámara al abandonar la pantalla
      setCamera(false);
    };
  }, []);

  // Solicita permisos de cámara si faltan y abre el visor QR.
  const openScanner = async () => {
    if (busy || locked.current || !concert.trim()) return;
    setResult("");
    setValid(false);
    try {
      const granted =
        permission?.granted || (await requestPermission()).granted;
      if (granted) {
        setCamera(true);
      } else {
        setResult(
          "Permiso de cámara denegado. Habilitá el acceso a la cámara en tu dispositivo para escanear códigos QR.",
        );
      }
    } catch {
      setResult(
        "No se pudo abrir la cámara. Verificá los permisos o que no esté en uso por otra aplicación.",
      );
    }
  };

  // Envía el qrToken leído por cámara al backend para validar y marcar la entrada.
  const scan = async (value: string) => {
    if (locked.current) return;
    const qrToken = value.trim();
    if (!qrToken) return;
    locked.current = true;
    setBusy(true);
    setCamera(false);
    setResult("");
    setValid(false);
    try {
      const { data } = await api.request<{ result: string }>(
        "/tickets/validate",
        {
          method: "POST",
          body: { concertId: concert.trim(), qrToken },
        },
      );
      setValid(data.result === "VALID");
      setResult(scanMessage(data.result));
      // Notifica en tiempo real al resto de vistas abiertas (el store ya actualiza la lista de asistentes).
      if (data.result === "VALID") {
        notifyTicketValidated();
      }
    } catch (e) {
      setResult(scanMessage(e instanceof ApiError ? e.code : "ERROR"));
    } finally {
      setBusy(false);
    }
  };
  // Libera el lock para habilitar el escaneo de la siguiente entrada.
  const next = () => {
    locked.current = false;
    setResult("");
    setValid(false);
  };
  return (
    <Card variant="featured">
      <SectionHeader
        title="Escáner QR de acceso"
        subtitle="Apuntá la cámara al código QR de la entrada para validar el ingreso."
      />
      {!camera && !result && (
        <View style={styles.row}>
          <Button
            title={busy ? "Validando entrada..." : "Escanear código QR"}
            disabled={busy || locked.current || !concert.trim()}
            onPress={() => void openScanner()}
          />
        </View>
      )}
      {camera && (
        <View style={{ gap: 10 }}>
          <View style={{ height: 320, borderRadius: 12, overflow: "hidden", position: "relative" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(data) => void scan(data.data)}
              onMountError={() => {
                setCamera(false);
                setResult("La cámara no está disponible en este dispositivo.");
              }}
            />
            {/* Botón flotante visible sobre el visor para cerrar y liberar la cámara */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar y cerrar escáner de cámara"
              onPress={() => setCamera(false)}
              style={({ pressed }) => ({
                position: "absolute",
                top: 12,
                right: 12,
                backgroundColor: pressed ? "rgba(0,0,0,0.85)" : "rgba(17,17,19,0.78)",
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.35)",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                zIndex: 10,
              })}
            >
              <Text aria-hidden style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✕</Text>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Cerrar cámara</Text>
            </Pressable>
          </View>
          <Button
            title="Cancelar escaneo"
            secondary
            onPress={() => setCamera(false)}
          />
        </View>
      )}
      <Notice message={result} error={!valid} />
      {result && (
        <View style={styles.row}>
          <Button title="Escanear siguiente entrada" onPress={next} />
        </View>
      )}
    </Card>
  );
}
