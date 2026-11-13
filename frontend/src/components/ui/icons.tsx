// Iconos vectoriales monocromáticos adaptables al tema claro y oscuro de Venti.
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";
import { colors } from "./theme";

interface IconProps {
  color?: string;
  size?: number;
}

// Icono monocromático de campana para notificaciones.
export function BellIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de carrito de compras para el header.
export function CartIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={21} r={1} stroke={color} strokeWidth={2} />
      <Circle cx={20} cy={21} r={1} stroke={color} strokeWidth={2} />
      <Path
        d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de flecha para el botón flotante de volver atrás.
export function ArrowBackIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de cartelera y música en vivo.
export function ConcertIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18V5l12-2v13M9 9l12-2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={6} cy={18} r={3} stroke={color} strokeWidth={2} />
      <Circle cx={18} cy={16} r={3} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Icono monocromático de entradas y tickets.
export function TicketIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 9a3 3 0 010 6v3a2 2 0 002 2h16a2 2 0 002-2v-3a3 3 0 010-6V6a2 2 0 00-2-2H4a2 2 0 00-2 2v3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={9}
        y1={4}
        x2={9}
        y2={20}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="2 3"
      />
    </Svg>
  );
}

// Icono monocromático de usuario y perfil.
export function UserIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Icono monocromático de seguridad y candado.
export function LockIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} stroke={color} strokeWidth={2} />
      <Path
        d="M7 11V7a5 5 0 0110 0v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de configuración de engranaje.
export function SettingsIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de objetivo y recomendaciones.
export function TargetIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Icono monocromático de escudo para administración.
export function ShieldIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de edificio y establecimientos.
export function BuildingIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de herramientas para servicios.
export function WrenchIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de micrófono para artistas.
export function MicIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de portapapeles para organizador.
export function ClipboardIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={8} y={2} width={8} height={4} rx={1} ry={1} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Icono monocromático de etiqueta/descuento para promociones.
export function TagIcon({ color = colors.text, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={7} y1={7} x2={7.01} y2={7} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Icono monocromático de sol para tema claro.
export function SunIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={2} />
      <Line x1={12} y1={1} x2={12} y2={3} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={12} y1={21} x2={12} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={1} y1={12} x2={3} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={21} y1={12} x2={23} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Icono monocromático de luna para tema oscuro.
export function MoonIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de usuarios para gestión administrativa.
export function UsersIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9} cy={7} r={4} stroke={color} strokeWidth={2} />
      <Path
        d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Icono monocromático de gráfico/estadísticas.
export function ChartBarIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={18} y1={20} x2={18} y2={10} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={12} y1={20} x2={12} y2={4} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={6} y1={20} x2={6} y2={14} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Icono monocromático de auditoría / registro.
export function AuditIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Resuelve el icono monocromático correspondiente a una ruta de navegación.
export function RouteIcon({ path, color = colors.text, size = 18 }: { path: string; color?: string; size?: number }) {
  if (path === "/cartelera" || path === "/discover" || path === "/search" || path.startsWith("/admin/concerts")) {
    return <ConcertIcon color={color} size={size} />;
  }
  if (path === "/tickets") return <TicketIcon color={color} size={size} />;
  if (path === "/notifications") return <BellIcon color={color} size={size} />;
  if (path === "/profile" || path === "/account-details" || path === "/profiles") {
    return <UserIcon color={color} size={size} />;
  }
  if (path.startsWith("/admin/users")) return <UsersIcon color={color} size={size} />;
  if (path.startsWith("/admin/promotions")) return <TagIcon color={color} size={size} />;
  if (path.includes("statistics")) return <ChartBarIcon color={color} size={size} />;
  if (path.includes("audit")) return <AuditIcon color={color} size={size} />;
  if (path.startsWith("/admin/organizations") || path.startsWith("/admin/establishments")) {
    return <BuildingIcon color={color} size={size} />;
  }
  if (path.startsWith("/admin")) return <ShieldIcon color={color} size={size} />;
  if (path.startsWith("/organizer")) return <ClipboardIcon color={color} size={size} />;
  if (path.startsWith("/marketplace")) return <BuildingIcon color={color} size={size} />;
  if (path.startsWith("/services")) return <WrenchIcon color={color} size={size} />;
  if (path.startsWith("/artists")) return <MicIcon color={color} size={size} />;
  if (path.startsWith("/staff")) return <TicketIcon color={color} size={size} />;
  if (path === "/purchases") return <CartIcon color={color} size={size} />;
  return <ConcertIcon color={color} size={size} />;
}
