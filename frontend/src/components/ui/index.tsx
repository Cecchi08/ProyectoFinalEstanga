import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { Pagination } from "../../types/api";
import { fieldError, inferRules, type Rule } from "../../utils/validation";
import { shouldShowBackToTop } from "./scroll";
import { colors, fonts, onNativePalette, radius, shadows, type } from "./theme";
import { useThemeMode } from "./themeMode";
export { colors, fonts, radius, shadows, type } from "./theme";
const buildStyles = () => ({
  page: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    // Room below the last control so the floating "Volver arriba" never covers it.
    paddingBottom: 96,
    gap: 20,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 20,
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
} as const);
export const styles = StyleSheet.create(buildStyles());
// Spread on every <Switch> so toggles use the brand instead of the platform default.
const buildSwitchColors = () => ({
  trackColor: { false: colors.borderStrong, true: colors.primary },
  thumbColor: colors.surface,
  ios_backgroundColor: colors.borderStrong,
});
export const switchColors = buildSwitchColors();
// iOS/Android: a theme change refills the tokens; these shared objects are rebuilt from them.
onNativePalette(() => {
  Object.assign(styles, StyleSheet.create(buildStyles()));
  Object.assign(switchColors, buildSwitchColors());
});
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => active && setReduced(value));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
type Focusable = { setAttribute(name: string, value: string): void; focus(options?: { preventScroll?: boolean }): void };
export function BackToTop({ onPress }: { onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver arriba"
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        right: 16,
        bottom: 16,
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        boxShadow: shadows.primary,
      })}
    >
      <Text aria-hidden style={{ color: colors.onPrimary, fontSize: 22, lineHeight: 24, fontWeight: "800" }}>
        ↑
      </Text>
    </Pressable>
  );
}
export function Page({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const scroller = useRef<ScrollView>(null);
  const header = useRef<View>(null);
  const [showTop, setShowTop] = useState(false);
  const reduceMotion = useReducedMotion();
  const backToTop = () => {
    scroller.current?.scrollTo({ y: 0, animated: !reduceMotion });
    // The button disappears at the top: move focus to the page title instead of losing it.
    if (Platform.OS === "web" && header.current) {
      const node = header.current as unknown as Focusable;
      node.setAttribute("tabindex", "-1");
      node.focus({ preventScroll: true });
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.page}
        scrollEventThrottle={32}
        onScroll={(event) => setShowTop(shouldShowBackToTop(event.nativeEvent.contentOffset.y))}
      >
        <View ref={header} style={{ gap: 10, marginBottom: 4 }}>
          <View aria-hidden style={{ flexDirection: "row", gap: 4 }}>
            <View style={{ width: 28, height: 4, borderRadius: radius.pill, backgroundColor: colors.primary }} />
            <View style={{ width: 8, height: 4, borderRadius: radius.pill, backgroundColor: colors.coral }} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle && <Text style={[styles.muted, { fontSize: 15, lineHeight: 22, maxWidth: 720 }]}>{subtitle}</Text>}
        </View>
        {children}
      </ScrollView>
      {showTop && <BackToTop onPress={backToTop} />}
    </View>
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
        // Secondary actions size to their label: lists stay light and the violet primary stands out.
        alignSelf: secondary ? "flex-start" : undefined,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: secondary ? (danger ? colors.danger : active ? colors.secondaryHover : colors.secondary) : solid,
        backgroundColor: secondary
          ? danger
            ? active
              ? colors.dangerSoft
              : "transparent"
            : active || pressed
              ? colors.secondaryHover
              : colors.secondary
          : danger
            ? solid
            : pressed
              ? colors.primaryPressed
              : active
                ? colors.primaryHover
                : solid,
        boxShadow: focused
          ? shadows.focus
          : !secondary && !danger && !disabled && active
            ? shadows.primary
            : undefined,
        opacity: disabled ? 0.5 : pressed && (secondary || danger) ? 0.8 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? (danger ? colors.danger : colors.onSecondary) : danger ? colors.onDanger : colors.onPrimary,
          fontSize: 15,
          fontWeight: "700",
          letterSpacing: 0.3,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function ThemeToggle() {
  const { theme, toggle } = useThemeMode();
  const [hovered, setHovered] = useState(false);
  const next = theme === "dark" ? "claro" : "oscuro";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Activar tema ${next}`}
      onPress={toggle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: hovered ? colors.surfaceHover : "transparent",
      }}
    >
      <Text aria-hidden style={{ color: colors.coral, fontSize: 16 }}>
        {theme === "dark" ? "☀" : "☾"}
      </Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{`Tema ${next}`}</Text>
    </Pressable>
  );
}
// A form registers its fields so a submit can check them all before calling the API.
type FormApi = { submitted: boolean; register(id: string, check: () => string | null): () => void };
const FormContext = createContext<FormApi | null>(null);
export function useForm() {
  const validators = useRef(new Map<string, () => string | null>());
  const [submitted, setSubmitted] = useState(false);
  const api = useMemo<FormApi>(
    () => ({
      submitted,
      register(id, check) {
        validators.current.set(id, check);
        return () => validators.current.delete(id);
      },
    }),
    [submitted],
  );
  return {
    api,
    // Called first inside action.run: throws so the request is never sent with invalid fields.
    assertValid() {
      setSubmitted(true);
      const invalid = [...validators.current.values()].map((check) => check()).filter(Boolean).length;
      if (invalid) throw new Error(invalid === 1 ? "Revisá el campo marcado." : `Revisá los ${invalid} campos marcados.`);
    },
  };
}
export function FormScope({ form, children }: PropsWithChildren<{ form: ReturnType<typeof useForm> }>) {
  return <FormContext.Provider value={form.api}>{children}</FormContext.Provider>;
}
// A blur caused by pressing a button must not show its error (and move the layout) before that click lands:
// while a pointer is down on the web, the blur error waits for the release.
let pointerDown = false;
if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
  document.addEventListener("pointerup", () => { pointerDown = false; }, true);
  document.addEventListener("pointercancel", () => { pointerDown = false; }, true);
}
const afterRelease = (show: () => void) => {
  if (!pointerDown) return show();
  // The click is dispatched right after pointerup; the error renders once it was handled.
  document.addEventListener("pointerup", () => setTimeout(show, 0), { once: true });
};
export function Field({
  label,
  required = false,
  rules,
  error,
  ...props
}: TextInputProps & { label: string; required?: boolean; rules?: Rule[]; error?: string }) {
  const form = useContext(FormContext);
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const check = useRef(() => null as string | null);
  check.current = () => fieldError(value, { required, rules: rules ?? inferRules(label) });
  useEffect(() => form?.register(id, () => check.current()), [form, id]);
  const message = error ?? (touched || form?.submitted ? check.current() : null);
  const errorId = `${id}-error`;
  return (
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Text style={[styles.label, focused && { color: colors.accent }, message ? { color: colors.danger } : null]}>
        {label}
        {required ? <Text aria-hidden style={{ color: colors.coral }}> *</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={label}
        aria-required={required || undefined}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
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
          afterRelease(() => setTouched(true));
          props.onBlur?.(event);
        }}
        style={[
          styles.input,
          message ? { borderColor: colors.danger } : null,
          focused && { borderColor: message ? colors.danger : colors.primary, boxShadow: shadows.focus },
          props.style,
        ]}
      />
      {message ? (
        <Text nativeID={errorId} accessibilityLiveRegion="polite" style={{ color: colors.danger, ...type.small }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
type Tone = "success" | "error" | "warning" | "info";
// A function, not a constant: on iOS/Android the tokens change with the theme.
const tones = (): Record<Tone, { color: string; soft: string; glyph: string }> => ({
  success: { color: colors.success, soft: colors.successSoft, glyph: "✓" },
  error: { color: colors.danger, soft: colors.dangerSoft, glyph: "!" },
  warning: { color: colors.warning, soft: colors.warningSoft, glyph: "!" },
  info: { color: colors.info, soft: colors.infoSoft, glyph: "i" },
});
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
  const { color, soft, glyph } = tones()[error ? "error" : (tone ?? "success")];
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
        borderLeftWidth: 4,
        borderColor: color,
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
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        gap: 6,
      }}
    >
      <Text aria-hidden style={{ color: colors.coral, fontSize: 22, fontFamily: fonts.display }}>
        ♪
      </Text>
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
