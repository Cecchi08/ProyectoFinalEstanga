// Genera los assets PNG del logotipo de Venti para Expo, Android y Web.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const assetsDir = path.resolve('assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Dibuja el isotipo de Venti en un canvas rasterizado de tamaño size x size.
function generateIconPng(size, isAdaptive = false) {
  const png = new PNG({ width: size, height: size });
  const bgR = 0x11, bgG = 0x11, bgB = 0x13; // #111113
  const cardR = 0x19, cardG = 0x19, cardB = 0x1D; // #19191D
  const goldR = 0xF5, goldG = 0xC5, goldB = 0x42; // #F5C542
  const darkGoldR = 0xE5, darkGoldG = 0xB3, darkGoldB = 0x2E; // #E5B32E

  const cx = size / 2;
  const cy = size / 2;
  const cardRadius = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Fondo oscuro
      let r = bgR, g = bgG, b = bgB, a = 255;

      // Tarjeta cuadrada con bordes redondeados
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const roundR = size * 0.18;
      const cornerX = Math.max(0, dx - (cardRadius - roundR));
      const cornerY = Math.max(0, dy - (cardRadius - roundR));
      const inCard = (cornerX * cornerX + cornerY * cornerY) <= roundR * roundR;

      if (inCard && !isAdaptive) {
        r = cardR; g = cardG; b = cardB;
      }

      // Dibujo de la 'V' estilizada y ondas de sonido
      // Coordenadas normalizadas [-1, 1] dentro del símbolo
      const scale = size * (isAdaptive ? 0.32 : 0.36);
      const nx = (x - cx) / scale;
      const ny = (y - cy) / scale;

      // Brazos de la V
      // Vértice en (0, 0.7), brazos hacia (-0.7, -0.6) y (0.7, -0.6)
      const absNx = Math.abs(nx);
      const armSlope = 1.6; // pendiente de los brazos
      const distFromVLine = Math.abs(ny - (armSlope * absNx - 0.5));
      const inV = distFromVLine < 0.22 && ny > -0.65 && ny < 0.65 && absNx < 0.85;

      // Barra acústica central invertida
      const inCenterCut = absNx < 0.28 && ny > -0.2 && ny < 0.4 && (ny > 1.2 * absNx - 0.05);

      // Barras laterales de onda sonora
      const inLeftBar = nx > -0.95 && nx < -0.85 && Math.abs(ny + 0.05) < 0.28;
      const inRightBar = nx > 0.85 && nx < 0.95 && Math.abs(ny + 0.05) < 0.28;

      if ((inV && !inCenterCut) || inLeftBar || inRightBar) {
        // Gradiente dorado de Venti
        const t = (y / size);
        r = Math.round(goldR * (1 - t * 0.2) + darkGoldR * (t * 0.2));
        g = Math.round(goldG * (1 - t * 0.2) + darkGoldG * (t * 0.2));
        b = Math.round(goldB * (1 - t * 0.2) + darkGoldB * (t * 0.2));
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return png;
}

// 1. Icono principal Expo (1024x1024)
const icon = generateIconPng(1024, false);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), PNG.sync.write(icon));

// 2. Adaptive icon Android (1024x1024)
const adaptiveIcon = generateIconPng(1024, true);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), PNG.sync.write(adaptiveIcon));

// 3. Favicon web (64x64)
const favicon = generateIconPng(64, false);
fs.writeFileSync(path.join(assetsDir, 'favicon.png'), PNG.sync.write(favicon));

console.log('Logos y assets de Venti generados exitosamente en /assets.');

