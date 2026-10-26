import { useState } from "react";
import { Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../services/api";
import { useResource } from "../../hooks/useResource";
import type { Concert, Purchase } from "../../types/api";
import {
  ActionFeedback,
  Button,
  Card,
  Copy,
  Field,
  Page,
  ResourceState,
  dateLabel,
  money,
  styles,
  useAction,
} from "../../components/ui";
// The location is optional while the concert is a draft.
export const place = (concert: Pick<Concert, "venue_name" | "city_name" | "province_name">) =>
  [concert.venue_name, [concert.city_name, concert.province_name].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Lugar a confirmar";
// Linked artist profiles in billing order; a concert without links only has the billing text.
export const lineup = (concert: Pick<Concert, "artists" | "artist_name">) =>
  concert.artists?.length ? concert.artists.map((artist) => artist.name).join(" · ") : concert.artist_name;
export default function ConcertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<Concert>(`/concerts/${id}`);
  const action = useAction();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const concert = resource.result?.data;
  const reserve = () =>
    action.run(async () => {
      if (!concert) return;
      const items = Object.entries(quantities)
        .filter(([, q]) => q !== "" && Number(q) !== 0)
        .map(([ticketTypeId, q]) => ({ ticketTypeId, quantity: Number(q) }));
      if (
        !items.length ||
        items.some(
          (item) => !Number.isInteger(item.quantity) || item.quantity < 1,
        )
      )
        throw new Error("Seleccioná una cantidad entera positiva.");
      const { data } = await api.request<Purchase>("/purchases", {
        method: "POST",
        body: { concertId: id, items },
      });
      router.push(`/purchases/${data.id}`);
    });
  return (
    <Page title={concert?.name ?? "Concierto"}>
      <ResourceState {...resource} retry={() => void resource.reload()} />
      {concert && (
        <>
          {concert.image_url && (
            <Image
              source={{ uri: concert.image_url }}
              style={{ width: "100%", height: 260, borderRadius: 18 }}
              accessibilityLabel={concert.name}
            />
          )}
          <Card>
            <Copy>{dateLabel(concert.start_datetime)}</Copy>
            <Copy>{place(concert)}</Copy>
            {concert.address_line && <Copy muted>{concert.address_line}</Copy>}
            <Copy>{concert.description}</Copy>
            <Copy muted>
              Artistas: {lineup(concert)}
            </Copy>
            <Copy muted>
              Géneros: {concert.genres.map((g) => g.name).join(", ")}
            </Copy>
            {concert.price_from != null && <Copy muted>Entradas desde {money(concert.price_from)}</Copy>}
          </Card>
          {concert.artists.some((artist) => artist.id) && (
            <Card>
              <Copy>En el cartel</Copy>
              <View style={styles.row}>
                {concert.artists.map((artist, index) =>
                  artist.id ? (
                    <Button key={artist.id} title={`${index === 0 ? "Principal: " : ""}${artist.name}`} secondary
                      onPress={() => router.push(`/artist/${artist.id}`)} />
                  ) : null,
                )}
              </View>
            </Card>
          )}
          <Copy>Elegí tus entradas</Copy>
          {concert.ticket_types.map((type) => (
            <Card key={type.id}>
              <Copy>
                {type.name} · {money(type.price)}
              </Copy>
              <Copy muted>
                {type.max_per_purchase
                  ? `Máximo por compra: ${type.max_per_purchase}`
                  : "Disponibilidad confirmada al reservar."}
              </Copy>
              {type.sale_end && (
                <Copy muted>Venta hasta {dateLabel(type.sale_end)}</Copy>
              )}
              <Field
                label={`Cantidad ${type.name}`}
                keyboardType="number-pad"
                value={quantities[type.id] ?? ""}
                placeholder="0"
                onChangeText={(value) =>
                  setQuantities({ ...quantities, [type.id]: value })
                }
              />
            </Card>
          ))}
          {!concert.ticket_types.length && (
            <Copy muted>No hay entradas disponibles.</Copy>
          )}
          <ActionFeedback action={action} />
          <View style={styles.row}>
            <Button
              title="Reservar entradas"
              disabled={
                action.busy ||
                concert.status !== "PUBLISHED" ||
                !concert.ticket_types.length
              }
              onPress={() => void reserve()}
            />
          </View>
          <Copy muted>
            La reserva tiene vencimiento. Revisá el total y confirmá en el
            siguiente paso. No se realiza ningún cobro externo.
          </Copy>
        </>
      )}
    </Page>
  );
}
