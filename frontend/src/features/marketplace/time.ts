// All marketplace cities are in Argentina (UTC-03:00, no DST); the backend reads calendar dates the same way.
export const MARKETPLACE_OFFSET = "-03:00";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDate = (value: string) => DATE.test(value.trim());
export function at(date: string, time: string): Date {
  if (!isDate(date) || !TIME.test(time.trim())) throw new Error("Usá fecha AAAA-MM-DD y horas HH:MM.");
  return new Date(`${date.trim()}T${time.trim()}:00${MARKETPLACE_OFFSET}`);
}
// Builds a slot from local times; a time earlier than the previous one belongs to the next day (events past midnight).
export function slot(date: string, times: { setup?: string; start: string; end: string; teardown?: string }) {
  const start = at(date, times.start);
  const next = (time: string, after: Date) => {
    const value = at(date, time);
    while (value <= after) value.setTime(value.getTime() + 86400000);
    return value;
  };
  const end = next(times.end, start);
  const setup = times.setup?.trim() ? at(date, times.setup) : start;
  if (setup > start) throw new Error("El armado debe empezar antes del evento.");
  const teardown = times.teardown?.trim() ? next(times.teardown, new Date(end.getTime() - 1)) : end;
  return {
    setup_start_at: setup.toISOString(),
    event_start_at: start.toISOString(),
    event_end_at: end.toISOString(),
    teardown_end_at: teardown.toISOString(),
  };
}
export const range = (from: string, to: string) =>
  `${new Date(from).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })} → ${new Date(to).toLocaleTimeString("es-AR", { timeStyle: "short" })}`;
export const days = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
