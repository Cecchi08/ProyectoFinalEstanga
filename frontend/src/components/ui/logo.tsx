// Identidad visual y logotipo original de Venti con temática de música en vivo y acústica.
import { Text, View } from "react-native";
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, fonts } from "./index";

interface LogoProps {
  size?: number;
  monochrome?: boolean;
}

// Símbolo e isotipo original de Venti: barras de ondas sonoras que convergen en la 'V' acústica.
export function VentiIsotype({ size = 32, monochrome = false }: LogoProps) {
  const primaryColor = monochrome ? colors.text : "#F5C542";
  const accentGradient = monochrome ? colors.text : "#E5B32E";

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Defs>
        <LinearGradient id="ventiGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={primaryColor} />
          <Stop offset="1" stopColor={accentGradient} />
        </LinearGradient>
      </Defs>
      {/* Fondo estilizado con esquinas sutilmente redondeadas */}
      <Rect width={40} height={40} rx={10} fill={monochrome ? "transparent" : "#19191D"} />
      
      {/* Barra izquierda alta que desciende formando el brazo izquierdo de la V */}
      <Path
        d="M9 10C9 8.89543 9.89543 8 11 8H13C14.1046 8 15 8.89543 15 10V22L20 32L15 22V10H9Z"
        fill="url(#ventiGrad)"
      />
      {/* Brazo izquierdo dinámico */}
      <Path
        d="M10 9L19.5 29.5C19.7 29.9 20.3 29.9 20.5 29.5L30 9C30.4 8.2 29.6 7.4 28.9 7.8L20 13.5L11.1 7.8C10.4 7.4 9.6 8.2 10 9Z"
        fill="url(#ventiGrad)"
      />
      {/* Ondas sonoras acústicas centrales */}
      <Path
        d="M20 16L16 23H24L20 16Z"
        fill={monochrome ? colors.bg : "#111113"}
      />
      {/* Barras de resonancia simétricas */}
      <Rect x="7" y="14" width="2.5" height="7" rx="1.25" fill="url(#ventiGrad)" opacity={0.6} />
      <Rect x="30.5" y="14" width="2.5" height="7" rx="1.25" fill="url(#ventiGrad)" opacity={0.6} />
    </Svg>
  );
}

// Logotipo completo de Venti: Isotipo + Tipografía distintiva de marca.
export function VentiLogo({ size = 32, monochrome = false }: LogoProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <VentiIsotype size={size} monochrome={monochrome} />
      <View style={{ gap: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: size * 0.58,
            fontWeight: "800",
            letterSpacing: 2,
            fontFamily: fonts.display,
          }}
        >
          VENTI
        </Text>
      </View>
    </View>
  );
}

