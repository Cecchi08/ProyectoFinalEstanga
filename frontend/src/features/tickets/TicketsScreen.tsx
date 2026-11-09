import { useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useResource } from "../../hooks/useResource";
import type { Ticket } from "../../types/api";
import {
  BentoGrid,
  Button,
  Card,
  Copy,
  Page,
  Pager,
  ResourceState,
  colors,
  dateLabel,
  radius,
  statusLabel,
  styles,
  useBento,
} from "../../components/ui";

export default function TicketsScreen() {
  const { width, mobile } = useBento();
  const [page, setPage] = useState(1);
  const resource = useResource<Ticket[]>(`/tickets?page=${page}`);
  return (
    <Page
      eyebrow="VENTI · PASES DIGITALES"
      title="Tus entradas"
      subtitle="Cada QR corresponde a una entrada. Presentalo al ingresar."
      actions={
        <Button
          title="Actualizar entradas"
          secondary
          onPress={() => void resource.reload()}
        />
      }
    >
      <ResourceState
        {...resource}
        empty={!resource.result?.data.length}
        retry={() => void resource.reload()}
      />
      <BentoGrid>
        {resource.result?.data.map((ticket) => (
          <View
            key={ticket.id}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              flexBasis: mobile ? "auto" : 520,
              width: mobile ? "100%" : undefined,
              maxWidth: "100%",
            }}
          >
            <Card variant="featured">
              <View
                style={{
                  flexDirection: mobile ? "column" : "row",
                  justifyContent: "space-between",
                  alignItems: mobile ? "stretch" : "center",
                  gap: 18,
                }}
              >
                <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
                  <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radius.pill,
                        backgroundColor:
                          ticket.status === "VALID" && ticket.concert_status === "PUBLISHED"
                            ? colors.success
                            : colors.borderStrong,
                      }}
                    />
                    <Text style={[styles.label, { color: colors.accent }]}>PASE DE ACCESO</Text>
                  </View>
                  <Text style={styles.heading}>{ticket.concert_name}</Text>
                  <Copy muted>
                    {dateLabel(ticket.start_datetime)} · {ticket.venue_name}
                  </Copy>
                  {ticket.venue_address ? <Copy muted>{ticket.venue_address}</Copy> : null}
                  <View
                    style={{
                      marginTop: 4,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Copy strong>
                      {ticket.ticket_type_name} · {statusLabel(ticket.status)}
                    </Copy>
                  </View>
                </View>
                {ticket.status === "VALID" &&
                ticket.concert_status === "PUBLISHED" ? (
                  <View
                    accessibilityLabel={`QR de entrada para ${ticket.concert_name} (${ticket.ticket_type_name})`}
                    style={{
                      backgroundColor: "#fff",
                      padding: 18,
                      alignSelf: "center",
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <QRCode
                      value={ticket.qr_token}
                      size={Math.min(180, Math.max(120, width - 148))}
                      quietZone={12}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      padding: 14,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Copy muted>Esta entrada no está habilitada para ingresar.</Copy>
                  </View>
                )}
              </View>
            </Card>
          </View>
        ))}
      </BentoGrid>
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
    </Page>
  );
}
