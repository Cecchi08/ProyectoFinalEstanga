import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop } from "react-native-svg";
import type { Pagination } from "../../types/api";
import { fieldError, inferRules, type Rule } from "../../utils/validation";
import { shouldShowBackToTop } from "./scroll";
import { colors, onNativePalette, radius, shadows, type } from "./theme";
import { useThemeMode } from "./themeMode";
export { colors, fonts, radius, shadows, space, type } from "./theme";

export function useBento() {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const mobile = width < 680;
  const tablet = width >= 680 && width < 1040;
  const desktop = width >= 1040;
  const columns = desktop ? 3 : tablet ? 2 : 1;
  const cell = (span = 1, total = columns): ViewStyle => {
    if (mobile || total <= 1 || span >= total) {
      return { width: "100%", minWidth: 0, maxWidth: "100%", flexShrink: 1 };
    }
    const gap = 16;
    const usableSpan = Math.min(span, total);
    const basis = Math.floor(((width - 44 - gap * (total - 1)) / total) * usableSpan);
    return {
      flexGrow: usableSpan,
      flexShrink: 1,
      flexBasis: Math.max(240, basis),
      minWidth: 0,
      maxWidth: "100%",
    };
  };
  return {
    width,
    compact,
    mobile,
    tablet,
    desktop,
    isCompact: compact,
    isMobile: mobile,
    isTablet: tablet,
    isDesktop: desktop,
    columns,
    cols: columns,
    cell,
  };
}

const buildStyles = () => ({
  page: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 26,
    // Room below the last control so the floating "Volver arriba" never covers it.
    paddingBottom: 96,
    gap: 18,
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 20,
    gap: 12,
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    boxShadow: shadows.card,
  },
  cardFeatured: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    padding: 22,
    gap: 14,
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    boxShadow: shadows.card,
  },
  cardSubtle: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 18,
    gap: 10,
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    minWidth: 0,
    maxWidth: "100%",
  },
  between: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    maxWidth: "100%",
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    minWidth: 0,
    maxWidth: "100%",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: "flex-start",
  },
  badgeMuted: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  bentoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
  },
  title: { color: colors.text, ...type.title },
  heading: { color: colors.text, ...type.heading },
  subheading: { color: colors.text, ...type.subheading },
  text: { color: colors.text, ...type.body },
  muted: { color: colors.muted, ...type.small },
  label: { color: colors.muted, ...type.label },
  metric: { color: colors.text, ...type.metric },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    minHeight: 46,
    minWidth: 0,
    maxWidth: "100%",
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
        right: 18,
        bottom: 18,
        width: 46,
        height: 46,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primaryHover,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        boxShadow: shadows.primary,
      })}
    >
      <Text aria-hidden style={{ color: colors.onPrimary, fontSize: 20, lineHeight: 22, fontWeight: "800" }}>
        ↑
      </Text>
    </Pressable>
  );
}

export function Page({
  title,
  subtitle,
  eyebrow = "VENTI · LIVE PLATFORM",
  actions,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode }>) {
  const scroller = useRef<ScrollView>(null);
  const header = useRef<View>(null);
  const [showTop, setShowTop] = useState(false);
  const reduceMotion = useReducedMotion();
  const { compact, mobile } = useBento();
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
        contentContainerStyle={[
          styles.page,
          compact ? { paddingHorizontal: 14, paddingTop: 18, gap: 14 } : mobile ? { paddingHorizontal: 18, paddingTop: 22, gap: 16 } : null,
        ]}
        scrollEventThrottle={32}
        onScroll={(event) => setShowTop(shouldShowBackToTop(event.nativeEvent.contentOffset.y))}
      >
        <View
          ref={header}
          style={{
            flexDirection: mobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: mobile ? "flex-start" : "flex-end",
            gap: 12,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ gap: 6, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
            <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary }} />
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" }}>
                {eyebrow}
              </Text>
            </View>
            <Text accessibilityRole="header" style={[styles.title, compact && { fontSize: 22, lineHeight: 28 }]}>
              {title}
            </Text>
            {subtitle && (
              <Text style={[styles.muted, { fontSize: 14, lineHeight: 20, maxWidth: 680 }]}>
                {subtitle}
              </Text>
            )}
          </View>
          {actions ? <View style={[styles.row, { flexShrink: 1 }]}>{actions}</View> : null}
        </View>
        {children}
      </ScrollView>
      {showTop && <BackToTop onPress={backToTop} />}
    </View>
  );
}

const bentoCardData = Platform.OS === "web" ? { dataSet: { bentoCard: "true" } } : {};
const bentoMediaData = Platform.OS === "web" ? { dataSet: { bentoMedia: "true" } } : {};

export function Card({
  children,
  variant = "default",
  flush = false,
  style,
}: PropsWithChildren<{
  variant?: "default" | "featured" | "subtle";
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const { compact } = useBento();
  const base =
    variant === "featured"
      ? styles.cardFeatured
      : variant === "subtle"
        ? styles.cardSubtle
        : styles.card;
  return (
    <View
      {...bentoCardData}
      style={[
        base,
        compact && !flush ? { padding: 14 } : null,
        flush ? { padding: 0, overflow: "hidden" } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function BentoGrid({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.bentoGrid, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4 }}>
      <View style={{ gap: 2, flexShrink: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View aria-hidden style={{ width: 4, height: 16, borderRadius: radius.pill, backgroundColor: colors.primary }} />
          <Text style={styles.heading}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function StatTile({
  label,
  value,
  hint,
  featured = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  featured?: boolean;
}) {
  const { mobile } = useBento();
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        flexBasis: mobile ? "100%" : featured ? 260 : 185,
        maxWidth: "100%",
      }}
    >
      <Card variant={featured ? "featured" : "default"} style={{ height: "100%", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Copy muted>{label}</Copy>
          <View
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: featured ? colors.primary : colors.borderStrong,
            }}
          />
        </View>
        <Text style={[styles.metric, featured && { fontSize: 30, lineHeight: 36, color: colors.accent }]}>
          {value}
        </Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </Card>
    </View>
  );
}

// Curated architectural musical cover: displays the real photo when present, or a sleek stage/studio graphic when absent.
const hashSeed = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export function MusicalCover({
  uri,
  alt,
  kind = "concert",
  height = 180,
  badge,
  subBadge,
}: {
  uri?: string | null;
  alt: string;
  kind?: "concert" | "venue" | "artist" | "service";
  height?: number;
  badge?: string;
  subBadge?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [uri]);
  const seed = hashSeed(alt || kind);
  const bars = Array.from({ length: 18 }, (_, index) => {
    const wave = Math.sin((index + (seed % 7)) * 0.75) * 0.4 + 0.55;
    return Math.round(24 + wave * 68);
  });
  return (
    <View
      {...bentoMediaData}
      style={{
        width: "100%",
        height,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: "#0D0D11",
        borderWidth: 1,
        borderColor: colors.border,
        position: "relative",
      }}
    >
      {uri && !imgFailed ? (
        <Image
          source={{ uri }}
          accessibilityLabel={alt}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <View aria-hidden style={{ width: "100%", height: "100%" }}>
          <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={`bg-${seed}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#09090B" />
                <Stop offset="55%" stopColor="#13131A" />
                <Stop offset="100%" stopColor="#1E1B4B" />
              </LinearGradient>
              <LinearGradient id={`glow-${seed}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#4F46E5" stopOpacity="0.42" />
                <Stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            <Rect width="400" height="200" fill={`url(#bg-${seed})`} />
            {/* Architectural grid lines */}
            <Line x1="0" y1="50" x2="400" y2="50" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="0" y1="100" x2="400" y2="100" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="0" y1="150" x2="400" y2="150" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="100" y1="0" x2="100" y2="200" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.5" />
            <Line x1="200" y1="0" x2="200" y2="200" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.5" />
            <Line x1="300" y1="0" x2="300" y2="200" stroke="#27272A" strokeWidth="0.7" strokeOpacity="0.5" />
            {kind === "concert" && (
              <>
                <Path d="M 80 0 L 10 200 L 170 200 Z" fill={`url(#glow-${seed})`} />
                <Path d="M 310 0 L 220 200 L 390 200 Z" fill={`url(#glow-${seed})`} />
                {bars.map((barHeight, i) => (
                  <Rect
                    key={i}
                    x={34 + i * 19}
                    y={168 - barHeight}
                    width={10}
                    height={barHeight}
                    rx={3}
                    fill={i % 4 === 0 ? "#818CF8" : i % 2 === 0 ? "#4F46E5" : "#27272A"}
                    opacity={0.85}
                  />
                ))}
              </>
            )}
            {kind === "venue" && (
              <>
                <Rect x="44" y="34" width="312" height="132" rx="14" stroke="#3F3F46" strokeWidth="1.5" fill="#121217" fillOpacity="0.6" />
                <Rect x="74" y="54" width="110" height="92" rx="8" stroke="#6366F1" strokeWidth="1.5" fill="#4F46E5" fillOpacity="0.15" />
                <Circle cx="268" cy="100" r="38" stroke="#818CF8" strokeWidth="1.5" fill="#4F46E5" fillOpacity="0.12" />
                <Circle cx="268" cy="100" r="16" stroke="#A5B4FC" strokeWidth="1.5" fill="none" />
              </>
            )}
            {kind === "artist" && (
              <>
                <Circle cx="200" cy="100" r="72" stroke="#3F3F46" strokeWidth="1.5" fill="#18181B" fillOpacity="0.7" />
                <Circle cx="200" cy="100" r="50" stroke="#4F46E5" strokeWidth="1.5" fill="none" />
                <Circle cx="200" cy="100" r="28" stroke="#818CF8" strokeWidth="1.5" fill="#4F46E5" fillOpacity="0.25" />
                <Circle cx="200" cy="100" r="7" fill="#A5B4FC" />
              </>
            )}
            {kind === "service" && (
              <>
                {bars.slice(0, 12).map((barHeight, i) => (
                  <Rect
                    key={i}
                    x={52 + i * 26}
                    y={40}
                    width={12}
                    height={120}
                    rx={6}
                    fill="#1F1F26"
                  />
                ))}
                {bars.slice(0, 12).map((barHeight, i) => (
                  <Circle
                    key={`knob-${i}`}
                    cx={58 + i * 26}
                    cy={60 + (barHeight % 75)}
                    r={6}
                    fill={i % 3 === 0 ? "#818CF8" : "#4F46E5"}
                  />
                ))}
              </>
            )}
          </Svg>
        </View>
      )}
      {(badge || subBadge) && (
        <View
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            right: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {badge ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: "#09090BE6",
                borderWidth: 1,
                borderColor: "#27272A",
              }}
            >
              <Text style={{ color: "#FAFAFA", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
                {badge}
              </Text>
            </View>
          ) : <View />}
          {subBadge ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: "#4F46E5E6",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 }}>
                {subBadge}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function Copy({
  children,
  muted = false,
  strong = false,
  size,
  weight,
  color,
  style,
}: PropsWithChildren<{
  muted?: boolean;
  strong?: boolean;
  size?: keyof typeof type;
  weight?: TextStyle["fontWeight"];
  color?: string;
  style?: StyleProp<TextStyle>;
}>) {
  return (
    <Text
      style={[
        muted ? styles.muted : styles.text,
        size ? type[size] : null,
        strong ? { fontWeight: "700", color: colors.text } : null,
        weight ? { fontWeight: weight } : null,
        color ? { color } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
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
        minHeight: 44,
        maxWidth: "100%",
        flexShrink: 1,
        alignSelf: secondary ? "flex-start" : undefined,
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: secondary
          ? danger
            ? colors.danger
            : active
              ? colors.borderStrong
              : colors.border
          : solid,
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
        opacity: disabled ? 0.5 : pressed && (secondary || danger) ? 0.84 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? (danger ? colors.danger : colors.onSecondary) : danger ? colors.onDanger : colors.onPrimary,
          fontSize: 14,
          fontWeight: "600",
          letterSpacing: 0.15,
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
        minHeight: 40,
        paddingHorizontal: 13,
        paddingVertical: 7,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: hovered ? colors.surfaceHover : colors.surface,
      }}
    >
      <Text aria-hidden style={{ color: colors.accent, fontSize: 14, lineHeight: 18 }}>
        {theme === "dark" ? "☀" : "☾"}
      </Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{`Tema ${next}`}</Text>
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
    <View style={{ gap: 6, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Text style={[styles.label, focused && { color: colors.accent }, message ? { color: colors.danger } : null]}>
        {label}
        {required ? <Text aria-hidden style={{ color: colors.accent }}> *</Text> : null}
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
          props.multiline ? { minHeight: 84, textAlignVertical: "top" } : null,
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
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: color,
        backgroundColor: soft,
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <Text
        aria-hidden
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: radius.pill,
          backgroundColor: color,
          color: colors.bg,
          fontSize: 12,
          lineHeight: 20,
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
    <View style={{ paddingVertical: 28, alignItems: "center" }}>
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
        paddingVertical: 32,
        paddingHorizontal: 22,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        gap: 8,
      }}
    >
      <View
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 18, fontWeight: "700" }}>♪</Text>
      </View>
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
    <View
      style={[
        styles.row,
        {
          justifyContent: "space-between",
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      <Button
        title="Anterior"
        secondary
        disabled={pagination.page <= 1}
        onPress={() => onPage(pagination.page - 1)}
      />
      <Copy strong>
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

const STATUS_LABELS: Record<string, string> = {
  // General / Publicación
  DRAFT: "Borrador",
  PENDING_REVIEW: "En revisión",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
  FINISHED: "Finalizado",
  // Presupuestos, Cotizaciones y Propuestas
  REQUESTED: "Solicitado",
  SENT: "Enviado",
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
  // Reservas y Compras
  HOLD: "Reserva temporal",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  APPROVED: "Aprobado",
  REFUNDED: "Reembolsado",
  NONE: "Sin reembolso",
  // Entradas
  VALID: "Válida",
  USED: "Utilizada",
  // Usuarios y Organizaciones
  ACTIVE: "Activo",
  BLOCKED: "Suspendido",
  SUSPENDED: "Suspendida",
  DELETED: "Eliminado",
  // Integrantes y Fases
  OWNER: "Propietario",
  ADMIN: "Administrador",
  STAFF: "Equipo",
  MEMBER: "Integrante",
  VENUE: "Solo el espacio",
  ESTABLISHMENT: "Establecimiento completo",
  SETUP: "Armado",
  EVENT: "Evento",
  TEARDOWN: "Desarme",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return STATUS_LABELS[status] ?? status;
}

const FLOW_LABELS: Record<string, string> = {
  VENUE_TO_ARTIST: "Espacio físico → Artista",
  ARTIST_TO_VENUE: "Artista → Espacio físico",
  ORGANIZER_TO_ARTIST: "Organizador → Artista",
};

export function flowLabel(flow: string | null | undefined): string {
  if (!flow) return "";
  return FLOW_LABELS[flow] ?? flow;
}
