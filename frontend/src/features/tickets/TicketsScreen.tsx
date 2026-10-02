import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useResource } from "../../hooks/useResource";
import type { Ticket } from "../../types/api";
import {
  Button,
  Card,
  Copy,
  Page,
  Pager,
  ResourceState,
  dateLabel,
} from "../../components/ui";
export default function TicketsScreen() {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(1);
  const resource = useResource<Ticket[]>(`/tickets?page=${page}`);
  return (
    <Page
      title="Tus entradas"
      subtitle="Cada QR corresponde a una entrada. Presentalo al ingresar."
    >
      <Button
        title="Actualizar entradas"
        secondary
        onPress={() => void resource.reload()}
      />
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((ticket) => (
        <Card key={ticket.id}>
          <Copy>{ticket.concert_name}</Copy>
          <Copy muted>
            {dateLabel(ticket.start_datetime)} · {ticket.venue_name}
          </Copy>
          <Copy muted>{ticket.venue_address}</Copy>
          <Copy>
            {ticket.ticket_type_name} · #{ticket.id} · {ticket.status}
          </Copy>
          {ticket.status === "ACTIVE" &&
          ticket.concert_status === "PUBLISHED" ? (
            <View
              accessibilityLabel={`QR de entrada ${ticket.id}`}
              style={{
                backgroundColor: "#fff",
                padding: 20,
                alignSelf: "center",
                borderRadius: 12,
              }}
            >
              <QRCode
                value={ticket.qr_token}
                size={Math.min(200, Math.max(120, width - 152))}
                quietZone={12}
              />
            </View>
          ) : (
            <Copy muted>Esta entrada no está habilitada para ingresar.</Copy>
          )}
        </Card>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
