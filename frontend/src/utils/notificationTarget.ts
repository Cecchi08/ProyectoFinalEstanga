type NotificationTargetLike = {
  proposal_id?: string | null;
  service_quote_id?: string | null;
  reservation_id?: string | null;
  quote_id?: string | null;
  purchase_id?: string | null;
  concert_id?: string | null;
  concert_status?: string | null;
};

export function notificationTarget(item: NotificationTargetLike): { title: string; path: string } | null {
  if (item.proposal_id) {
    return { title: "Ver propuesta", path: `/proposals/${item.proposal_id}` };
  }
  if (item.service_quote_id) {
    return { title: "Ver cotización", path: `/services/quotes/${item.service_quote_id}` };
  }
  if (item.reservation_id) {
    return { title: "Ver reserva", path: `/marketplace/reservations/${item.reservation_id}` };
  }
  if (item.quote_id) {
    return { title: "Ver presupuesto", path: `/marketplace/quotes/${item.quote_id}` };
  }
  if (item.purchase_id) {
    return { title: "Ver compra", path: `/purchases/${item.purchase_id}` };
  }
  if (item.concert_id && item.concert_status === "PUBLISHED") {
    return { title: "Ver concierto", path: `/concerts/${item.concert_id}` };
  }
  return null;
}
