import { useEffect, useId, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  DAYS_SHORT,
  MONTH_NAMES,
  buildCalendarMonth,
  formatArgDate,
  formatArgDateTime,
  formatArgTime,
  fromArgDateTimeToUtcIso,
  isTime,
  quickArgDates,
  toArgDateParts,
} from "../../features/marketplace/time";
import { Button, Copy, colors, radius, shadows, styles, type, useBento, useFormRegistration } from "./index";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export type DateTimeMode = "date" | "datetime" | "time";

export function DateTimeField({
  label,
  value,
  onChange,
  mode = "date",
  required = false,
  disabled = false,
  shortcuts = true,
  defaultTime = "20:00",
  error,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  mode?: DateTimeMode;
  required?: boolean;
  disabled?: boolean;
  shortcuts?: boolean;
  defaultTime?: string;
  error?: string;
}) {
  const { mobile } = useBento();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const check = useRef(() => null as string | null);
  check.current = () => {
    if (!value || !value.trim()) {
      return required ? "Este campo es obligatorio." : null;
    }
    if (mode === "time") {
      return isTime(value) ? null : "Elegí un horario válido.";
    }
    return toArgDateParts(value) ? null : "Elegí una fecha válida.";
  };
  const submitted = useFormRegistration(id, () => check.current());
  const message = error ?? (touched || submitted ? check.current() : null);
  const errorId = `${id}-error`;

  const quick = quickArgDates();
  const parsed = mode === "time" ? null : toArgDateParts(value);
  const initialParts = parsed ?? toArgDateParts(quick.today)!;

  const [viewYear, setViewYear] = useState<number>(initialParts.year);
  const [viewMonth, setViewMonth] = useState<number>(initialParts.month);
  const [draftDate, setDraftDate] = useState<string>(parsed?.dateStr ?? quick.today);
  const [draftHour, setDraftHour] = useState<string>(
    mode === "time" && isTime(value)
      ? value.slice(0, 2)
      : parsed
        ? String(parsed.hour).padStart(2, "0")
        : defaultTime.slice(0, 2),
  );
  const [draftMinute, setDraftMinute] = useState<string>(
    mode === "time" && isTime(value)
      ? value.slice(3, 5)
      : parsed
        ? String(parsed.minute).padStart(2, "0")
        : defaultTime.slice(3, 5),
  );

  function openPicker() {
    if (disabled) return;
    if (mode === "time") {
      const current = isTime(value) ? value.trim() : defaultTime;
      setDraftHour(current.slice(0, 2));
      setDraftMinute(current.slice(3, 5));
    } else {
      const current = toArgDateParts(value) ?? toArgDateParts(quickArgDates().today)!;
      setViewYear(current.year);
      setViewMonth(current.month);
      setDraftDate(current.dateStr);
      if (mode === "datetime") {
        const timeSource = toArgDateParts(value)?.timeStr ?? defaultTime;
        setDraftHour(timeSource.slice(0, 2));
        setDraftMinute(timeSource.slice(3, 5));
      }
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function shiftMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    while (nextMonth < 1) {
      nextMonth += 12;
      nextYear -= 1;
    }
    while (nextMonth > 12) {
      nextMonth -= 12;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  function applySelection(nextDate = draftDate, nextHour = draftHour, nextMinute = draftMinute, close = true) {
    setTouched(true);
    if (mode === "time") {
      onChange(`${nextHour}:${nextMinute}`);
    } else if (mode === "date") {
      onChange(nextDate);
    } else {
      onChange(fromArgDateTimeToUtcIso(nextDate, `${nextHour}:${nextMinute}`));
    }
    if (close) setOpen(false);
  }

  function selectDateShortcut(targetDate: string) {
    const parts = toArgDateParts(targetDate);
    if (parts) {
      setViewYear(parts.year);
      setViewMonth(parts.month);
    }
    setDraftDate(targetDate);
    if (mode === "date") {
      applySelection(targetDate, draftHour, draftMinute, true);
    } else {
      applySelection(targetDate, draftHour, draftMinute, false);
    }
  }

  const displayValue =
    mode === "time"
      ? formatArgTime(value)
      : mode === "datetime"
        ? formatArgDateTime(value)
        : formatArgDate(value);

  const placeholderText =
    mode === "time"
      ? "Elegir horario"
      : mode === "datetime"
        ? "Elegir fecha y horario"
        : "Elegir fecha";

  const cells = mode !== "time" ? buildCalendarMonth(viewYear, viewMonth) : [];

  return (
    <View style={{ gap: 6, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Text style={[styles.label, open && { color: colors.accentText }, message ? { color: colors.dangerText } : null]}>
        {label}
        {required ? <Text aria-hidden style={{ color: colors.accentText }}> *</Text> : null}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled, expanded: open }}
          aria-required={required || undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          disabled={disabled}
          onPress={openPicker}
          style={({ pressed }) => [
            styles.input,
            {
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              backgroundColor: pressed ? colors.surfaceHover : colors.surfaceAlt,
              borderColor: message ? colors.dangerBorder : displayValue ? colors.accentBorder : colors.borderStrong,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              color: displayValue ? colors.text : colors.muted,
              fontSize: 15,
              fontWeight: displayValue ? "600" : "400",
              flexShrink: 1,
            }}
          >
            {displayValue || placeholderText}
          </Text>
          <Text aria-hidden style={{ color: colors.accentText, fontSize: 13, fontWeight: "700" }}>
            {mode === "time" ? "🕒" : "📅"}
          </Text>
        </Pressable>

        {!required && Boolean(value) && !disabled && (
          <Button
            title={`Limpiar ${label.toLowerCase()}`}
            secondary
            onPress={() => {
              setTouched(true);
              onChange("");
            }}
          />
        )}
      </View>

      {message ? (
        <Text nativeID={errorId} accessibilityLiveRegion="polite" style={{ color: colors.dangerText, ...type.small }}>
          {message}
        </Text>
      ) : null}

      {open && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(10, 10, 12, 0.74)",
              justifyContent: mobile ? "flex-end" : "center",
              alignItems: "center",
              padding: mobile ? 0 : 20,
            }}
          >
          <View
            style={{
              width: "100%",
              maxWidth: mobile ? "100%" : 520,
              maxHeight: mobile ? "90%" : "86%",
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderBottomLeftRadius: mobile ? 0 : radius.xl,
              borderBottomRightRadius: mobile ? 0 : radius.xl,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              padding: mobile ? 16 : 22,
              gap: 12,
              boxShadow: shadows.card,
            }}
          >
            <View style={styles.between}>
              <View style={{ gap: 2, flexShrink: 1 }}>
                <Copy size="subheading" weight="700">
                  {label}
                </Copy>
                <Copy muted size="small">
                  Horario de Argentina (dd/mm/aaaa)
                </Copy>
              </View>
              <Button title="Cerrar" secondary onPress={() => setOpen(false)} />
            </View>

            <ScrollView
              style={{ maxHeight: mobile ? 460 : 500 }}
              contentContainerStyle={{ gap: 14, paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              {mode !== "time" && shortcuts && (
                <View style={styles.row}>
                  <Button
                    title="Hoy"
                    secondary={draftDate !== quick.today}
                    onPress={() => selectDateShortcut(quick.today)}
                  />
                  <Button
                    title="Mañana"
                    secondary={draftDate !== quick.tomorrow}
                    onPress={() => selectDateShortcut(quick.tomorrow)}
                  />
                  <Button
                    title="Este fin de semana"
                    secondary={draftDate !== quick.weekend}
                    onPress={() => selectDateShortcut(quick.weekend)}
                  />
                </View>
              )}

              {mode !== "time" && (
                <View
                  style={{
                    gap: 10,
                    padding: 12,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={styles.between}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Button title="«" secondary onPress={() => setViewYear((y) => y - 1)} />
                      <Button title="‹" secondary onPress={() => shiftMonth(-1)} />
                    </View>
                    <Copy strong>
                      {MONTH_NAMES[viewMonth - 1]} {viewYear}
                    </Copy>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Button title="›" secondary onPress={() => shiftMonth(1)} />
                      <Button title="»" secondary onPress={() => setViewYear((y) => y + 1)} />
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {DAYS_SHORT.map((dayName) => (
                      <View key={dayName} style={{ width: "13.5%", alignItems: "center", paddingVertical: 4 }}>
                        <Copy muted size="small" weight="700">
                          {dayName}
                        </Copy>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6 }}>
                    {cells.map((cell, idx) => {
                      if (!cell.day || !cell.dateStr) {
                        return <View key={`empty-${idx}`} style={{ width: "13.5%", height: 40 }} />;
                      }
                      const isSelected = cell.dateStr === draftDate;
                      const isToday = cell.dateStr === quick.today;
                      const cellDate = cell.dateStr;
                      return (
                        <Pressable
                          key={cellDate}
                          accessibilityRole="button"
                          accessibilityLabel={`Día ${cell.day} (${formatArgDate(cellDate)})`}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => {
                            setDraftDate(cellDate);
                            if (mode === "date") {
                              applySelection(cellDate, draftHour, draftMinute, true);
                            } else {
                              applySelection(cellDate, draftHour, draftMinute, false);
                            }
                          }}
                          style={{
                            width: "13.5%",
                            height: 40,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: isSelected
                              ? colors.primaryHover
                              : isToday
                                ? colors.accentBorder
                                : colors.border,
                            backgroundColor: isSelected
                              ? colors.primary
                              : isToday
                                ? colors.accentSoft
                                : colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: isSelected ? colors.onPrimary : isToday ? colors.accentText : colors.text,
                              fontWeight: isSelected || isToday ? "700" : "500",
                              fontSize: 13,
                            }}
                          >
                            {cell.day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {(mode === "datetime" || mode === "time") && (
                <View
                  style={{
                    gap: 10,
                    padding: 12,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Copy strong>
                    Horario seleccionado: {draftHour}:{draftMinute} hs
                  </Copy>
                  <Copy muted size="small">
                    Hora (00 a 23)
                  </Copy>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {HOURS.map((h) => {
                      const active = draftHour === h;
                      return (
                        <Pressable
                          key={`h-${h}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Hora ${h}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            setDraftHour(h);
                            if (mode === "datetime") {
                              applySelection(draftDate, h, draftMinute, false);
                            }
                          }}
                          style={{
                            minWidth: 42,
                            minHeight: 38,
                            paddingHorizontal: 8,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: active ? colors.primaryHover : colors.borderStrong,
                            backgroundColor: active ? colors.primary : colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: active ? colors.onPrimary : colors.text,
                              fontWeight: active ? "700" : "600",
                              fontSize: 13,
                            }}
                          >
                            {h}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Copy muted size="small">
                    Minutos
                  </Copy>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {MINUTES.map((m) => {
                      const active = draftMinute === m;
                      return (
                        <Pressable
                          key={`m-${m}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Minuto ${m}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            setDraftMinute(m);
                            if (mode === "datetime") {
                              applySelection(draftDate, draftHour, m, false);
                            }
                          }}
                          style={{
                            minWidth: 46,
                            minHeight: 38,
                            paddingHorizontal: 10,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: active ? colors.primaryHover : colors.borderStrong,
                            backgroundColor: active ? colors.primary : colors.surface,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: active ? colors.onPrimary : colors.text,
                              fontWeight: active ? "700" : "600",
                              fontSize: 13,
                            }}
                          >
                            :{m}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.between}>
              {!required && Boolean(value) ? (
                <Button
                  title="Limpiar"
                  secondary
                  onPress={() => {
                    setTouched(true);
                    onChange("");
                    setOpen(false);
                  }}
                />
              ) : (
                <View />
              )}
              <Button
                title="Confirmar"
                onPress={() => applySelection(draftDate, draftHour, draftMinute, true)}
              />
            </View>
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
}

