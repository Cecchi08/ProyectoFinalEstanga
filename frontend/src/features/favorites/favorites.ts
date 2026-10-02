import { api } from "../../services/api";

export async function setFavorite(
  concertId: string,
  favorite: boolean,
): Promise<void> {
  await api.request(`/favorites/${encodeURIComponent(concertId)}`, {
    method: favorite ? "POST" : "DELETE",
  });
}
