import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type DimensionValue,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop } from "react-native-svg";
import { getServerNow } from "../../services/http";
import type { Pagination } from "../../types/api";
import { fieldError, inferRules, type Rule } from "../../utils/validation";
import { shouldShowBackToTop } from "./scroll";
import { colors, onNativePalette, radius, shadows, type } from "./theme";
import { useThemeMode } from "./themeMode";
export { colors, fonts, radius, shadows, space, type } from "./theme";
export { DateTimeField, type DateTimeMode } from "./DateTimeField";
export { useReducedMotion } from "../../hooks/useReducedMotion";
export { useDebouncedValue } from "../../hooks/useDebouncedValue";

export function useBento() {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const mobile = width < 720;
  const tablet = width >= 720 && width < 1024;
  const desktop = width >= 1024;
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
    paddingHorizontal: 24,
    paddingTop: 26,
    // Room below the last control so the floating "Volver arriba" never covers it.
    paddingBottom: 96,
    gap: 20,
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
    backgroundColor: colors.featuredBg,
    borderWidth: 1,
    borderColor: colors.featuredBorder,
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
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
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

import { useReducedMotion } from "../../hooks/useReducedMotion";

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
          compact ? { paddingHorizontal: 14, paddingTop: 18, gap: 12 } : mobile ? { paddingHorizontal: 16, paddingTop: 20, gap: 16 } : null,
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
          <View style={{ gap: 4, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
            <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary }} />
              <Text style={{ color: colors.accentText, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
                {eyebrow}
              </Text>
            </View>
            <Text accessibilityRole="header" style={[styles.title, !mobile && type.hero, compact && { fontSize: 22, lineHeight: 28 }]}>
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
  const { compact, mobile } = useBento();
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
        mobile && !flush ? { padding: 16 } : null,
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
  const { mobile } = useBento();
  return (
    <View
      style={[
        styles.bentoGrid,
        mobile ? { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch", gap: 12 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
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
        flexBasis: mobile ? "auto" : featured ? 260 : 185,
        width: mobile ? "100%" : undefined,
        maxWidth: "100%",
      }}
    >
      <Card variant={featured ? "featured" : "default"} style={{ flexGrow: 1, justifyContent: "space-between", gap: 8 }}>
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

export const MusicalCover = memo(function MusicalCover({
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
        borderRadius: radius.lg,
        overflow: "hidden",
        backgroundColor: "#141417",
        borderWidth: 1,
        borderColor: colors.border,
        position: "relative",
      }}
    >
      {uri && !imgFailed ? (
        <>
          <Image
            source={{ uri }}
            accessibilityLabel={alt}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%" }}
          />
          <View
            aria-hidden
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 52,
              backgroundColor: "rgba(17, 17, 19, 0.52)",
            }}
          />
        </>
      ) : (
        <View aria-hidden style={{ width: "100%", height: "100%" }}>
          <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={`bg-${seed}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#141417" />
                <Stop offset="55%" stopColor="#1B1B20" />
                <Stop offset="100%" stopColor="#232329" />
              </LinearGradient>
              <LinearGradient id={`glow-${seed}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#F5C542" stopOpacity="0.18" />
                <Stop offset="100%" stopColor="#F5C542" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            <Rect width="400" height="200" fill={`url(#bg-${seed})`} />
            {/* Architectural grid lines */}
            <Line x1="0" y1="50" x2="400" y2="50" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="0" y1="100" x2="400" y2="100" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="0" y1="150" x2="400" y2="150" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.6" />
            <Line x1="100" y1="0" x2="100" y2="200" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.5" />
            <Line x1="200" y1="0" x2="200" y2="200" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.5" />
            <Line x1="300" y1="0" x2="300" y2="200" stroke="#383842" strokeWidth="0.7" strokeOpacity="0.5" />
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
                    fill={i % 6 === 0 ? "#D9383A" : i % 3 === 0 ? "#F5C542" : "#383842"}
                    opacity={0.85}
                  />
                ))}
              </>
            )}
            {kind === "venue" && (
              <>
                <Rect x="44" y="34" width="312" height="132" rx="14" stroke="#383842" strokeWidth="1.5" fill="#18181C" fillOpacity="0.7" />
                <Rect x="74" y="54" width="110" height="92" rx="8" stroke="#F5C542" strokeWidth="1.5" fill="#F5C542" fillOpacity="0.14" />
                <Circle cx="268" cy="100" r="38" stroke="#F5C542" strokeWidth="1.5" fill="#F5C542" fillOpacity="0.1" />
                <Circle cx="268" cy="100" r="16" stroke="#D9383A" strokeWidth="1.5" fill="none" />
              </>
            )}
            {kind === "artist" && (
              <>
                <Circle cx="200" cy="100" r="72" stroke="#383842" strokeWidth="1.5" fill="#18181B" fillOpacity="0.7" />
                <Circle cx="200" cy="100" r="50" stroke="#F5C542" strokeWidth="1.5" fill="none" />
                <Circle cx="200" cy="100" r="28" stroke="#F7CE5B" strokeWidth="1.5" fill="#F5C542" fillOpacity="0.18" />
                <Circle cx="200" cy="100" r="7" fill="#D9383A" />
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
                    fill="#232329"
                  />
                ))}
                {bars.slice(0, 12).map((barHeight, i) => (
                  <Circle
                    key={`knob-${i}`}
                    cx={58 + i * 26}
                    cy={60 + (barHeight % 75)}
                    r={6}
                    fill={i % 4 === 0 ? "#D9383A" : "#F5C542"}
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
            minWidth: 0,
          }}
        >
          {badge ? (
            <View
              style={{
                flexShrink: 1,
                maxWidth: subBadge ? "48%" : "100%",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: "rgba(17, 17, 19, 0.90)",
                borderWidth: 1,
                borderColor: "#383842",
              }}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ color: "#F5F5F2", fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 1 }}
              >
                {badge}
              </Text>
            </View>
          ) : <View />}
          {subBadge ? (
            <View
              style={{
                flexShrink: 1,
                maxWidth: badge ? "58%" : "100%",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: "rgba(25, 25, 29, 0.90)",
                borderWidth: 1,
                borderColor: "#5C4B1B",
              }}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ color: "#F7CE5B", fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.6, flexShrink: 1 }}
              >
                {subBadge}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
});

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
  const solid = danger ? colors.danger : colors.primary;
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
        minHeight: 48,
        maxWidth: "100%",
        flexShrink: 1,
        alignSelf: secondary ? "flex-start" : undefined,
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: secondary
          ? danger
            ? colors.dangerBorder
            : colors.borderStrong
          : danger
            ? colors.danger
            : colors.primaryHover,
        backgroundColor: secondary
          ? danger
            ? active || pressed
              ? colors.dangerBorder
              : colors.dangerSoft
            : active || pressed
              ? colors.secondaryHover
              : colors.secondary
          : danger
            ? pressed || active
              ? colors.dangerHover
              : solid
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
        opacity: disabled ? 0.55 : pressed && (secondary || danger) ? 0.9 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary ? (danger ? colors.dangerText : colors.onSecondary) : danger ? colors.onDanger : colors.onPrimary,
          fontSize: 14,
          fontWeight: secondary ? "600" : "700",
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

export function useFormRegistration(id: string, check: () => string | null): boolean {
  const form = useContext(FormContext);
  useEffect(() => form?.register(id, check), [form, id, check]);
  return Boolean(form?.submitted);
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
    <View style={{ gap: 6, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Text style={[styles.label, focused && { color: colors.accentText }, message ? { color: colors.dangerText } : null]}>
        {label}
        {required ? <Text aria-hidden style={{ color: colors.accentText }}> *</Text> : null}
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
          message ? { borderColor: colors.dangerBorder } : null,
          focused && { borderColor: message ? colors.dangerBorder : colors.focus, boxShadow: shadows.focus },
          props.style,
        ]}
      />
      {message ? (
        <Text nativeID={errorId} accessibilityLiveRegion="polite" style={{ color: colors.dangerText, ...type.small }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

type Tone = "success" | "error" | "warning" | "info";
const tones = (): Record<Tone, { color: string; border: string; text: string; soft: string; glyphColor: string; glyph: string }> => ({
  success: { color: colors.success, border: colors.successBorder, text: colors.successText, soft: colors.successSoft, glyphColor: "#FFFFFF", glyph: "✓" },
  error: { color: colors.danger, border: colors.dangerBorder, text: colors.dangerText, soft: colors.dangerSoft, glyphColor: colors.onDanger, glyph: "!" },
  warning: { color: colors.warning, border: colors.warningBorder, text: colors.warningText, soft: colors.warningSoft, glyphColor: colors.bg, glyph: "!" },
  info: { color: colors.info, border: colors.infoBorder, text: colors.infoText, soft: colors.infoSoft, glyphColor: colors.bg, glyph: "i" },
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
  const { color, border, text, soft, glyphColor, glyph } = tones()[error ? "error" : (tone ?? "success")];
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
        borderColor: border,
        borderLeftColor: color,
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
          color: glyphColor,
          fontSize: 12,
          lineHeight: 20,
          fontWeight: "800",
          textAlign: "center",
        }}
      >
        {glyph}
      </Text>
      <Text style={{ flex: 1, color: text, ...type.body }}>{message}</Text>
    </View>
  );
}

export function SkeletonBox({
  width = "100%",
  height = 20,
  borderRadius = radius.md,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulseAnim.setValue(0.7);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 750,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim, reducedMotion]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceAlt,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number | string }[];
  value: T;
  onChange(id: T): void;
}) {
  const { mobile } = useBento();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        padding: 4,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        width: "100%",
        maxWidth: "100%",
      }}
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => ({
              minHeight: 40,
              paddingHorizontal: mobile ? 12 : 16,
              paddingVertical: 8,
              borderRadius: radius.md,
              backgroundColor: active
                ? colors.primary
                : pressed
                  ? colors.surfaceHover
                  : "transparent",
              borderWidth: 1,
              borderColor: active ? colors.primaryHover : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            })}
          >
            <Text
              style={{
                color: active ? colors.onPrimary : colors.text,
                fontSize: 14,
                fontWeight: active ? "700" : "500",
              }}
            >
              {tab.label}
            </Text>
            {tab.badge !== undefined && (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: radius.pill,
                  backgroundColor: active ? "rgba(0,0,0,0.2)" : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? "transparent" : colors.border,
                }}
              >
                <Text
                  style={{
                    color: active ? colors.onPrimary : colors.muted,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {tab.badge}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ResourceState({
  loading,
  error,
  empty,
  retry,
  skeleton,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  retry(): void;
  skeleton?: "card" | "list" | "table" | boolean;
}) {
  if (loading) {
    if (skeleton === "card" || skeleton === true) {
      return (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando"
          aria-busy={true}
          style={{ width: "100%", gap: 14, paddingVertical: 10 }}
        >
          <ActivityIndicator
            accessibilityLabel="Cargando"
            color={colors.accent}
            size="small"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {[1, 2].map((i) => (
              <View
                key={i}
                style={{
                  flexGrow: 1,
                  flexBasis: 280,
                  padding: 16,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  gap: 12,
                }}
              >
                <SkeletonBox height={140} borderRadius={radius.md} />
                <SkeletonBox width="70%" height={20} />
                <SkeletonBox width="45%" height={16} />
                <SkeletonBox width="30%" height={36} borderRadius={radius.md} />
              </View>
            ))}
          </View>
        </View>
      );
    }
    if (skeleton === "list") {
      return (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando"
          aria-busy={true}
          style={{ width: "100%", gap: 10, paddingVertical: 10 }}
        >
          <ActivityIndicator
            accessibilityLabel="Cargando"
            color={colors.accent}
            size="small"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                padding: 14,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: 8,
              }}
            >
              <SkeletonBox width="60%" height={18} />
              <SkeletonBox width="40%" height={14} />
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: 28, alignItems: "center" }}>
        <ActivityIndicator accessibilityLabel="Cargando" color={colors.accent} size="large" />
      </View>
    );
  }
  return error ? (
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

export function QuantityStepper({
  label,
  value,
  min = 0,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  onChange(next: number): void;
}) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0, maxWidth: "100%" }}>
      <Copy muted size="small">
        {label}
      </Copy>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Disminuir ${label}`}
          accessibilityState={{ disabled: !canDecrease }}
          disabled={!canDecrease}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: pressed && canDecrease ? colors.secondaryHover : colors.secondary,
            opacity: canDecrease ? 1 : 0.45,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ color: colors.onSecondary, fontSize: 18, fontWeight: "800" }}>−</Text>
        </Pressable>
        <View
          accessibilityLabel={label}
          style={{
            minWidth: 44,
            height: 44,
            paddingHorizontal: 10,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: value > 0 ? colors.accentBorder : colors.border,
            backgroundColor: value > 0 ? colors.accentSoft : colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: value > 0 ? colors.accentText : colors.text, fontSize: 15, fontWeight: "700" }}>
            {value}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${label}`}
          accessibilityState={{ disabled: !canIncrease }}
          disabled={!canIncrease}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: canIncrease ? colors.primaryHover : colors.borderStrong,
            backgroundColor: canIncrease ? (pressed ? colors.primaryPressed : colors.primary) : colors.secondary,
            opacity: canIncrease ? 1 : 0.45,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ color: canIncrease ? colors.onPrimary : colors.onSecondary, fontSize: 18, fontWeight: "800" }}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Re-synchronizes resource state with the backend when the app returns to foreground,
// window regains focus, or network reconnects.
export function useHoldSync(enabled: boolean, onSync: () => void) {
  const syncRef = useRef(onSync);
  syncRef.current = onSync;

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncRef.current();
    });
    const onWindowFocus = () => syncRef.current();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", onWindowFocus);
      window.addEventListener("online", onWindowFocus);
    }
    return () => {
      sub.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("focus", onWindowFocus);
        window.removeEventListener("online", onWindowFocus);
      }
    };
  }, [enabled]);
}

// Informative, approximate HOLD countdown indicator.
// Never pauses, extends, or modifies the HOLD on the client; the backend remains the sole authority.
export function HoldIndicator({
  expiresAt,
  active = true,
  onExpire,
}: {
  expiresAt?: string | null;
  active?: boolean;
  onExpire?: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => getServerNow());
  const notifiedExpire = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    notifiedExpire.current = false;
  }, [expiresAt]);

  useEffect(() => {
    if (!active || !expiresAt) return;
    setNowMs(getServerNow());
    const timer = setInterval(() => {
      const current = getServerNow();
      setNowMs(current);
      const target = Date.parse(expiresAt);
      if (!Number.isNaN(target) && current >= target && !notifiedExpire.current) {
        notifiedExpire.current = true;
        expireRef.current?.();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [active, expiresAt]);

  if (!active || !expiresAt) return null;
  const targetMs = Date.parse(expiresAt);
  if (Number.isNaN(targetMs)) return null;
  const remainingMs = targetMs - nowMs;
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
  const formattedTarget = dateLabel(expiresAt);

  return (
    <View style={[styles.badge, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
      <Copy size="small" color={colors.accentText} weight="700">
        {remainingMinutes > 0
          ? `Reserva temporal (~${remainingMinutes} min restantes · vence ${formattedTarget})`
          : `Reserva temporal por vencer (${formattedTarget})`}
      </Copy>
    </View>
  );
}
