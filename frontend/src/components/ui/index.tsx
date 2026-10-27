import { useRef, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { Pagination } from "../../types/api";
import { colors, radius, shadows, type } from "./theme";
export { colors, radius, shadows, type } from "./theme";
export const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 20,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 22,
    gap: 12,
    boxShadow: shadows.card,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  title: { color: colors.text, ...type.title },
  heading: { color: colors.text, ...type.heading },
  text: { color: colors.text, ...type.body },
  muted: { color: colors.muted, ...type.small },
  label: { color: colors.muted, ...type.label },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
});
// Spread on every <Switch> so toggles use the brand instead of the platform default.
export const switchColors = {
  trackColor: { false: colors.borderStrong, true: colors.primary },
  thumbColor: colors.text,
  ios_backgroundColor: colors.borderStrong,
};
export function Page({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.page}
    >
      <View style={{ gap: 8, marginBottom: 4 }}>
        <View
          aria-hidden
          style={{ width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.primary }}
        />
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle && <Text style={[styles.muted, { fontSize: 15, lineHeight: 22, maxWidth: 720 }]}>{subtitle}</Text>}
      </View>
      {children}
    </ScrollView>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Copy({
  children,
  muted = false,
}: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={muted ? styles.muted : styles.text}>{children}</Text>;
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered && !disabled;
  const solid = danger ? colors.dangerStrong : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: 46,
        maxWidth: "100%",
        flexShrink: 1,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: secondary
          ? danger
            ? colors.danger
            : active
              ? colors.accent
              : colors.borderStrong
          : solid,
        backgroundColor: secondary
          ? active
            ? danger
              ? colors.dangerSoft
              : colors.surfaceHover
            : "transparent"
          : danger
            ? solid
            : pressed
              ? colors.primaryPressed
              : active
                ? colors.primaryHover
                : solid,
        boxShadow: focused
          ? shadows.focus
          : !secondary && !danger && !disabled
            ? shadows.primary
            : undefined,
        opacity: disabled ? 0.5 : pressed && (secondary || danger) ? 0.8 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? (danger ? colors.danger : colors.text) : colors.onPrimary,
          fontSize: 15,
          fontWeight: "700",
          letterSpacing: 0.2,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Text style={[styles.label, focused && { color: colors.accent }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        autoCapitalize="none"
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && { borderColor: colors.primary, boxShadow: shadows.focus },
          props.style,
        ]}
      />
    </View>
  );
}
type Tone = "success" | "error" | "warning" | "info";
const tones: Record<Tone, { color: string; soft: string; glyph: string }> = {
  success: { color: colors.success, soft: colors.successSoft, glyph: "✓" },
  error: { color: colors.danger, soft: colors.dangerSoft, glyph: "!" },
  warning: { color: colors.warning, soft: colors.warningSoft, glyph: "!" },
  info: { color: colors.info, soft: colors.infoSoft, glyph: "i" },
};
export function Notice({
  message,
  error = false,
  tone,
}: {
  message: string;
  error?: boolean;
  tone?: Tone;
}) {
  if (!message) return null;
  const { color, soft, glyph } = tones[error ? "error" : (tone ?? "success")];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: soft,
        backgroundColor: soft,
      }}
    >
      <Text
        aria-hidden
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
          borderRadius: radius.pill,
          backgroundColor: color,
          color: colors.bg,
          fontSize: 13,
          lineHeight: 22,
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        {glyph}
      </Text>
      <Text style={{ flex: 1, color, ...type.body }}>{message}</Text>
    </View>
  );
}
export function ResourceState({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  retry(): void;
}) {
  return loading ? (
    <View style={{ paddingVertical: 24, alignItems: "center" }}>
      <ActivityIndicator accessibilityLabel="Cargando" color={colors.accent} size="large" />
    </View>
  ) : error ? (
    <Card>
      <Notice message={error} error />
      <Button title="Reintentar" onPress={retry} />
    </Card>
  ) : empty ? (
    <View
      style={{
        paddingVertical: 28,
        paddingHorizontal: 20,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
        alignItems: "center",
      }}
    >
      <Copy muted>No hay resultados para mostrar.</Copy>
    </View>
  ) : null;
}
export function Pager({
  pagination,
  onPage,
}: {
  pagination?: Pagination;
  onPage(page: number): void;
}) {
  if (!pagination || pagination.total_pages < 2) return null;
  return (
    <View style={styles.row}>
      <Button
        title="Anterior"
        secondary
        disabled={pagination.page <= 1}
        onPress={() => onPage(pagination.page - 1)}
      />
      <Copy>
        {pagination.page} / {pagination.total_pages}
      </Copy>
      <Button
        title="Siguiente"
        secondary
        disabled={pagination.page >= pagination.total_pages}
        onPress={() => onPage(pagination.page + 1)}
      />
    </View>
  );
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, setMessage, run };
}
export function ActionFeedback({
  action,
}: {
  action: ReturnType<typeof useAction>;
}) {
  return (
    <>
      <Notice message={action.error} error />
      <Notice message={action.message} />
      {action.busy && <ActivityIndicator accessibilityLabel="Procesando" color={colors.accent} />}
    </>
  );
}
export const dateLabel = (date: string) =>
  new Date(date).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const money = (amount: string | number) =>
  `$ ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
