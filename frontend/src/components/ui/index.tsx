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
export const colors = {
  bg: "#0c0b14",
  panel: "#191724",
  border: "#373246",
  text: "#f5f2ff",
  muted: "#b7afc9",
  accent: "#ba9bff",
  danger: "#ff9d9d",
  good: "#9fe5c0",
};
export const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    gap: 20,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  heading: { color: colors.text, fontSize: 20, fontWeight: "700" },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
    minHeight: 48,
  },
});
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
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 46,
        maxWidth: "100%",
        flexShrink: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: danger ? colors.danger : colors.accent,
        backgroundColor: secondary
          ? "transparent"
          : danger
            ? colors.danger
            : colors.accent,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? colors.text : colors.bg,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7, flexGrow: 1 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        color: error ? colors.danger : colors.good,
        fontSize: 16,
        lineHeight: 24,
      }}
    >
      {message}
    </Text>
  ) : null;
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
    <ActivityIndicator accessibilityLabel="Cargando" color={colors.accent} />
  ) : error ? (
    <Card>
      <Notice message={error} error />
      <Button title="Reintentar" onPress={retry} />
    </Card>
  ) : empty ? (
    <Card>
      <Copy muted>No hay resultados para mostrar.</Copy>
    </Card>
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
      {action.busy && <ActivityIndicator color={colors.accent} />}
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
