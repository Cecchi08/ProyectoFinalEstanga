import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../../services/api";
import { ApiError } from "../../services/http";
import {
  Button,
  Card,
  Copy,
  Field,
  Notice,
  Page,
  ResourceState,
  Pager,
  dateLabel,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { useAuth } from "../../contexts/AuthContext";
import type { Concert, Attendee } from "../../types/api";
import { scanMessage } from "./validation";
export default function StaffScreen() {
  const { roles } = useAuth();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Concert | null>(null);
  const [attendeePage, setAttendeePage] = useState(1);
  const assignments = useResource<Concert[]>(
    selected ? null : `/staff/assignments?page=${page}`,
  );
  const attendees = useResource<Attendee[]>(
    selected ? `/concerts/${selected.id}/attendees?page=${attendeePage}` : null,
  );
  return (
    <Page
      title="Control de acceso"
      subtitle={
        roles.includes("ADMIN")
          ? "Seleccioná un concierto para gestionar el ingreso."
          : "Seleccioná uno de tus conciertos asignados."
      }
    >
      {!selected ? (
        <>
          <Button
            title="Actualizar conciertos"
            secondary
            onPress={() => void assignments.reload()}
          />
          <ResourceState
            {...assignments}
            empty={assignments.result?.data.length === 0}
            retry={() => void assignments.reload()}
          />
          {assignments.result?.data.map((concert) => (
            <Card key={concert.id}>
              <Copy>{concert.name}</Copy>
              <Copy muted>
                {dateLabel(concert.start_datetime)} · {concert.venue_name} ·{" "}
                {concert.status}
              </Copy>
              <Button
                title={`Seleccionar ${concert.name}`}
                onPress={() => {
                  setAttendeePage(1);
                  setSelected(concert);
                }}
              />
            </Card>
          ))}
          <Pager pagination={assignments.result?.pagination} onPage={setPage} />
        </>
      ) : (
        <>
          <Card>
            <Copy>{selected.name}</Copy>
            <Copy muted>
              {dateLabel(selected.start_datetime)} · {selected.venue_name} ·{" "}
              {selected.status}
            </Copy>
            <Button
              title="Cambiar concierto"
              secondary
              onPress={() => setSelected(null)}
            />
          </Card>
          <Scanner
            key={selected.id}
            concert={selected.id}
            onValidated={() => void attendees.reload()}
          />
          <Copy>Asistentes</Copy>
          <Copy muted>
            Una fila por entrada emitida. El nombre corresponde al comprador.
          </Copy>
          <Button
            title="Actualizar asistentes"
            secondary
            onPress={() => void attendees.reload()}
          />
          <ResourceState
            {...attendees}
            empty={attendees.result?.data.length === 0}
            retry={() => void attendees.reload()}
          />
          {attendees.result?.data.map((attendee) => (
            <Card key={attendee.ticket_id}>
              <Copy>
                {attendee.first_name} {attendee.last_name}
              </Copy>
              <Copy>
                Entrada #{attendee.ticket_id} · {attendee.ticket_type_name} ·{" "}
                {attendee.status}
              </Copy>
              <Copy muted>
                Compra: {attendee.purchase_status}
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
        </>
      )}
    </Page>
  );
}

function Scanner({
  concert,
  onValidated,
}: {
  concert: string;
  onValidated(): void;
}) {
  const [token, setToken] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [result, setResult] = useState("");
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const scan = async (value: string) => {
    if (locked.current) return;
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
          body: { concertId: concert.trim(), qrToken: value.trim() },
        },
      );
      setValid(data.result === "VALID");
      setResult(scanMessage(data.result));
      onValidated();
    } catch (e) {
      setResult(scanMessage(e instanceof ApiError ? e.code : "ERROR"));
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    locked.current = false;
    setResult("");
    setToken("");
    setValid(false);
  };
  return (
    <Card>
      <Field
        label="Token QR"
        value={token}
        editable={!busy}
        onChangeText={setToken}
        autoCorrect={false}
        onSubmitEditing={() => void scan(token)}
      />
      <Button
        title={busy ? "Validando…" : "Validar entrada"}
        disabled={busy || locked.current || !concert.trim() || !token.trim()}
        onPress={() => void scan(token)}
      />
      {Platform.OS !== "web" && !camera && (
        <Button
          title="Escanear con cámara"
          secondary
          disabled={busy || locked.current || !concert.trim()}
          onPress={() => {
            void (async () => {
              try {
                const granted =
                  permission?.granted || (await requestPermission()).granted;
                if (granted) setCamera(true);
                else
                  setResult(
                    "Permiso de cámara denegado. Podés ingresar el token manualmente.",
                  );
              } catch {
                setResult(
                  "No se pudo abrir la cámara. Ingresá el token manualmente.",
                );
              }
            })();
          }}
        />
      )}
      {camera && (
        <>
          <View style={{ height: 300, borderRadius: 12, overflow: "hidden" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(data) => void scan(data.data)}
              onMountError={() => {
                setCamera(false);
                setResult(
                  "Cámara no disponible. Ingresá el token manualmente.",
                );
              }}
            />
          </View>
          <Button
            title="Cerrar cámara"
            secondary
            onPress={() => setCamera(false)}
          />
        </>
      )}
      <Notice message={result} error={!valid} />
      {result && <Button title="Siguiente entrada" onPress={next} />}
      <Copy muted>
        En escritorio podés pegar el token o usar un lector QR USB que escriba
        el código y presione Enter.
      </Copy>
    </Card>
  );
}
