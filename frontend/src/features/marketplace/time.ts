// Marketplace and concert dates/times operate in Argentina time (America/Argentina/Buenos_Aires, fixed UTC-03:00)
// and are serialized to UTC ISO 8601 strings when sent to the API.
export const TZ = "America/Argentina/Buenos_Aires";
const ARG_OFFSET_MS = -3 * 60 * 60 * 1000;

export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
export const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const DAYS_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;

export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export const days = WEEKDAY_NAMES;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function at(date: string, time: string): Date {
  if (!isDate(date) || !isTime(time)) {
    throw new Error("Elegí una fecha y un horario válidos desde el selector.");
  }
  const parsed = new Date(`${date.trim()}T${time.trim()}:00-03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("La fecha o la hora elegidas no son válidas.");
  }
  return parsed;
}

// Converts an ISO 8601 timestamp or YYYY-MM-DD string into Argentina (UTC-03:00) wall-clock components.
export function toArgDateParts(value: string | null | undefined): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string;
  timeStr: string;
} | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const pureDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (pureDate) {
    const year = Number(pureDate[1]);
    const month = Number(pureDate[2]);
    const day = Number(pureDate[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
      return null;
    }
    return {
      year,
      month,
      day,
      hour: 20,
      minute: 0,
      dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
      timeStr: "20:00",
    };
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  const argDate = new Date(ms + ARG_OFFSET_MS);
  const year = argDate.getUTCFullYear();
  const month = argDate.getUTCMonth() + 1;
  const day = argDate.getUTCDate();
  const hour = argDate.getUTCHours();
  const minute = argDate.getUTCMinutes();
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
    timeStr: `${pad2(hour)}:${pad2(minute)}`,
  };
}

// Converts an Argentina local date (YYYY-MM-DD) and time (HH:MM) into a UTC ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ).
export function fromArgDateTimeToUtcIso(dateStr: string, timeStr = "20:00"): string {
  return at(dateStr, timeStr).toISOString();
}

// Formats YYYY-MM-DD or ISO string as dd/mm/aaaa in Argentina time.
export function formatArgDate(value: string | null | undefined): string {
  const parts = toArgDateParts(value);
  if (!parts) return "";
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

// Formats ISO string as "dd/mm/aaaa · HH:MM hs" in Argentina time.
export function formatArgDateTime(value: string | null | undefined): string {
  const parts = toArgDateParts(value);
  if (!parts) return "";
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year} · ${parts.timeStr} hs`;
}

// Formats HH:MM as "HH:MM hs".
export function formatArgTime(value: string | null | undefined): string {
  if (!value || !isTime(value)) return "";
  return `${value.trim()} hs`;
}

// Returns Today, Tomorrow, and This Weekend (Saturday, or Sunday if today is Sunday) in Argentina (YYYY-MM-DD).
export function quickArgDates(nowMs = Date.now()): {
  today: string;
  tomorrow: string;
  weekend: string;
} {
  const argNow = new Date(nowMs + ARG_OFFSET_MS);
  const toYmd = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const today = toYmd(argNow);
  const tomorrowDate = new Date(argNow.getTime() + 86400000);
  const tomorrow = toYmd(tomorrowDate);
  const dow = argNow.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const daysToWeekend = dow === 0 || dow === 6 ? 0 : 6 - dow;
  const weekendDate = new Date(argNow.getTime() + daysToWeekend * 86400000);
  const weekend = toYmd(weekendDate);
  return { today, tomorrow, weekend };
}

export type CalendarCell = {
  day: number | null;
  dateStr: string | null;
};

// Builds a Monday-first calendar grid for a given year and month (1..12).
export function buildCalendarMonth(year: number, month: number): CalendarCell[] {
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
  const leadingEmpty = (firstDayUtc.getUTCDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingEmpty; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateStr: null });
  }
  return cells;
}

export function validateOpeningHours(
  slots: { day_of_week: number; opens_at: string; closes_at: string }[],
): string | null {
  for (const slot of slots) {
    if (slot.day_of_week < 1 || slot.day_of_week > 7) {
      return "Seleccioná un día válido de lunes a domingo.";
    }
    if (!isTime(slot.opens_at) || !isTime(slot.closes_at)) {
      return "Elegí horarios de apertura y cierre válidos.";
    }
    if (slot.opens_at === slot.closes_at) {
      return `En ${WEEKDAY_NAMES[slot.day_of_week]}, la hora de apertura y cierre no pueden ser iguales.`;
    }
  }
  return null;
}

// Setup/event/teardown windows can cross midnight (e.g. 20:00 to 02:00 next day).
export function window(
  date: string,
  start: string,
  end: string,
  setup = start,
  teardown = end,
) {
  const setupStart = at(date, setup);
  const eventStart = at(date, start);
  const eventEnd = at(date, end);
  const teardownEnd = at(date, teardown);
  if (eventStart < setupStart) eventStart.setTime(eventStart.getTime() + 86400000);
  while (eventEnd <= eventStart) eventEnd.setTime(eventEnd.getTime() + 86400000);
  while (teardownEnd < eventEnd) teardownEnd.setTime(teardownEnd.getTime() + 86400000);
  return {
    setup_start_at: setupStart.toISOString(),
    event_start_at: eventStart.toISOString(),
    event_end_at: eventEnd.toISOString(),
    teardown_end_at: teardownEnd.toISOString(),
  };
}

export function slot(
  date: string,
  times: { setup?: string; start: string; end: string; teardown?: string },
) {
  return window(
    date,
    times.start,
    times.end,
    times.setup?.trim() || times.start,
    times.teardown?.trim() || times.end,
  );
}

export const range = (start: string, end: string) =>
  `${new Date(start).toLocaleString("es-AR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })} – ${new Date(end).toLocaleTimeString("es-AR", { timeZone: TZ, timeStyle: "short" })}`;
