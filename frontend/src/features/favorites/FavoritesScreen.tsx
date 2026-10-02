import { useState } from "react";
import { View } from "react-native";
import {
  Page,
  ResourceState,
  Button,
  ActionFeedback,
  Pager,
  useAction,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { ConcertCard } from "../concerts/ConcertList";
import { setFavorite } from "./favorites";
import type { Concert } from "../../types/api";

export default function FavoritesScreen() {
  const [page, setPage] = useState(1);
  const action = useAction();
  const resource = useResource<Concert[]>(`/favorites?page=${page}`);
  return (
    <Page
      title="Tus favoritos"
      subtitle="Guardados en tu cuenta, disponibles en todos tus dispositivos."
    >
      <Button
        title="Actualizar favoritos"
        secondary
        disabled={action.busy}
        onPress={() => void resource.reload()}
      />
      <ResourceState
        {...resource}
        empty={resource.result?.data.length === 0}
        retry={() => void resource.reload()}
      />
      {resource.result?.data.map((concert) => (
        <View key={concert.id} style={{ gap: 8 }}>
          <ConcertCard concert={concert} />
          <Button
            title={`Quitar favorito ${concert.name}`}
            secondary
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                await setFavorite(concert.id, false);
                if (page > 1 && resource.result?.data.length === 1)
                  setPage(page - 1);
                else await resource.reload();
              })
            }
          />
        </View>
      ))}
      <Pager pagination={resource.result?.pagination} onPage={setPage} />
      <ActionFeedback action={action} />
    </Page>
  );
}
