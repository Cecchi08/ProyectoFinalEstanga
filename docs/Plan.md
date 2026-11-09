# Venti — Investigación y propuesta profesional para el rediseño integral

**Equipo:** Investigador UX · Diseñador UI senior · Especialista en diseño responsive · Especialista en rendimiento frontend · Diseñador de motion design · Arquitecto de software especializado en apps móviles y marketplaces.

**Naturaleza del entregable:** Investigación y planificación. No se ha modificado código ni se ha inspeccionado el repositorio. Ninguna afirmación sobre el estado actual de Venti debe interpretarse como diagnóstico de implementación; las recomendaciones se separan explícitamente entre **generales** (aplicables sin auditar el código) y **condicionadas a inspección del repositorio**.


## 1. Resumen ejecutivo y objetivos

Venti conecta espacios musicales, artistas, organizadores y asistentes en el Partido de General Pueyrredón. El stack declarado —React Native + Expo SDK 57 + Expo Router, Node.js/Express + TypeScript, MySQL 8.4.11 en Aiven— es una base razonable para un marketplace académico. El riesgo principal de un rediseño en este contexto no es estético: es **introducir complejidad que no pueda defenderse, medirse ni completarse de extremo a extremo**.

Este informe propone una dirección **urbano contemporáneo** que no sea “fondo negro con botones amarillos”, sino un sistema con jerarquía cromática funcional, tipografía de alta legibilidad en tamaños pequeños, superficies y profundidad, y reglas de contraste verificables. En paralelo, establece una arquitectura de navegación basada en **bottom tabs dentro de la zona del pulgar**, objetivos de rendimiento medibles y un plan de validación con métricas que distinguen lo que se puede estudiar con usuarios de lo que exige instrumentación analítica.

**Decisiones críticas que se recomiendan desde ya:**

1. La **navegación principal móvil debe ser visible** (bottom tabs), no un menú hamburguesa. NN/g encontró que la navegación oculta se usó en el 57 % de los casos frente al 86 % cuando era visible o parcialmente visible, con una caída de más del 20 % en descubrimiento de contenido y usuarios móviles un 15 % más lentos.
2. La **paleta debe construirse como roles semánticos**, no como colores sueltos. El amarillo como CTA y el rojo como énfasis/error deben superar **4.5:1** para texto normal y **3:1** para texto grande, y **3:1** para componentes no textuales y estados de foco.
3. La **tipografía debe resolverse con una familia de UI** como Inter (variable, con eje óptico y altura de x alta), no con una display para cuerpo de texto.
4. En listados, la conversación técnica debe centrarse en **FlashList** frente a FlatList para listas grandes y en **expo-image** para decodificación y caché de imágenes, no en “optimizaciones genéricas”.
5. Las animaciones deben ser **condicionales y respetar `prefers-reduced-motion`**; no se recomienda animar por defecto transiciones decorativas.

**Objetivo general:** producir un plan maestro que mejore experiencia, identidad, usabilidad, rendimiento, adaptabilidad y calidad funcional, con justificación técnica defendible y sin prometer resultados que no se hayan medido.


## 2. Estudio de campo y metodología de investigación

### 2.1 Perfiles y tareas principales

| Perfil | Objetivo primario | Información que busca primero | Tarea crítica | Frustración probable |
|---|---|---|---|---|
| **Asistente** | Descubrir un concierto al que valga la pena ir y acceder | Fecha, lugar, género/artista, precio, disponibilidad | Descubrir → confirmar → acceso/entrada | Listados irrelevantes, información incompleta, checkout largo |
| **Artista** | Postularse a espacios/propuestas y gestionar su participación | Espacios compatibles, estado de propuestas, fechas | Explorar espacios → enviar propuesta → seguimiento | Falta de claridad sobre el estado de su propuesta |
| **Organizador** | Publicar un concierto, gestionar espacios y reservas | Disponibilidad de espacios, presupuestos, reservas activas | Crear concierto → gestionar reserva → publicar | Pasos duplicados, estados ambiguos, errores de validación |
| **Administrador** | Moderar, aprobar y resolver incidencias | Cola de pendientes, permisos, reportes | Revisar → aprobar/rechazar → auditar | Falta de contexto en una sola vista, acciones irreversibles sin confirmación |

**Tareas principales por perfil (para pruebas):**

- Asistente: encontrar un concierto de un género concreto en un rango de fechas y completar el flujo de acceso/entrada.
- Artista: localizar un espacio reservable y enviar una propuesta con presupuesto.
- Organizador: crear un concierto asociado a un espacio y verificar que la reserva queda en estado consistente.
- Administrador: aprobar una propuesta y rechazar otra con motivo, verificando que ambos cambios de estado son visibles para los afectados.

### 2.2 Recorridos habituales y puntos de abandono

En plataformas de eventos, el descubrimiento ocurre primero y la compra/confirmación después. DICE es referencia por checkout móvil en menos de 10 segundos, mientras Eventbrite presenta abandono en checkout para nightlife. Para Venti, el recorrido crítico es:

**Descubrimiento → detalle del concierto → verificación de disponibilidad/condiciones → confirmación/acceso → post-evento.**

Los puntos de abandono más probables, que deben instrumentarse y probarse:

- **Filtros que no devuelven resultados comprensibles** (el usuario no sabe si no hay oferta o si filtró demasiado).
- **Detalle sin información decisiva**: fecha, lugar exacto, precio y estado de disponibilidad no visibles sin scroll.
- **Cambio de rol o permisos no explicado**: un usuario con permisos múltiples que no entiende por qué ve u no ve una acción.
- **Estados de propuesta/reserva sin fecha ni próximo paso**.
- **Formularios largos sin validación progresiva**.

### 2.3 Qué debe ser visible y qué puede quedar en segundo plano

**Mayor visibilidad (primera pantalla y zona del pulgar):** búsqueda/descubrimiento, fecha y lugar del concierto, CTA principal del rol activo, estado de la tarea en curso (propuesta, reserva, publicación).

**Segundo plano:** configuración de cuenta, historial completo, preferencias avanzadas, gestión de permisos no frecuente. No se recomienda esconder acciones primarias en menús: la navegación oculta reduce el descubrimiento de forma medible.

### 2.4 Plan de pruebas de usabilidad

**Participantes:** mínimo 5 por perfil (20 en total) para una ronda formativa; 8–10 por perfil si se busca estabilizar hallazgos. Reclutamiento realista para el piloto: estudiantes, músicos locales, responsables de espacios y organizadores del Partido de General Pueyrredón.

**Formato:** sesiones moderadas de 45–60 minutos, presenciales o remotas, con think-aloud. Para móvil, preferir dispositivo real o emulador con tamaño de 390 px de ancho.

**Tareas concretas (ejemplos):**

1. “Encontrá un concierto de jazz en Mar del Plata este fin de semana y decime cuánto sale.”
2. “Como artista, encontrá un espacio que tenga capacidad para 200 personas y enviá una propuesta.”
3. “Como organizador, creá un concierto en un espacio que ya tiene una reserva confirmada. ¿Qué te muestra la app?”
4. “Como administrador, rechazá una propuesta indicando un motivo y verificá que el artista puede ver ese motivo.”

**Criterios de evaluación:** éxito/fracaso por tarea, tiempo hasta completar, número de pasos, errores recuperables vs. bloqueantes, necesidad de ayuda del moderador, y **confianza declarada** (escala 1–5) después de cada tarea.

### 2.5 Métricas: qué se puede investigar y qué requiere instrumentación

| Métrica | Cómo se obtiene en investigación | Cómo se obtiene en producción |
|---|---|---|
| Éxito de tarea | Observación directa | Eventos de finalización de flujo |
| Tiempo de realización | Cronómetro en sesión | Timestamps de inicio/fin de flujo |
| Errores | Registro manual de errores | Eventos de validación fallida, reintentos |
| Abandono | No observable de forma fiable en laboratorio | Eventos de salida de pantalla/flujo |
| Pasos | Conteo manual | Secuencia de eventos de navegación |
| Toques/clics | **No inventar mapas de calor**; se puede registrar la secuencia observada | Analítica de eventos táctiles con consentimiento |

**Regla explícita:** los mapas de calor y los porcentajes de clics **no se obtienen de una prueba de usabilidad pequeña**. Requieren instrumentación y volumen; en el piloto deben tratarse como hipótesis, no como datos.

### 2.6 Cómo documentar

- Plantilla por sesión: perfil, tarea, resultado, tiempo, errores, citas literales y observaciones de comportamiento.
- Video/screen recording con consentimiento.
- Informe de hallazgos agrupados por severidad (bloqueante, mayor, menor) y por pantalla/flujo.
- Separar **hallazgos observados** de **recomendaciones** y de **suposiciones pendientes de auditar**.


## 3. Identidad visual urbano contemporáneo y sistema de diseño

### 3.1 Principio rector

“Urbano contemporáneo” en Venti debe significar **contraste controlado, energía concentrada y superficies con intención**, no una estética monocroma con acentos arbitrarios. La metáfora operativa: cartelería urbana nocturna —carbón como fondo, luz amarilla como señal, rojo como alerta— pero con la disciplina de un sistema de producto.

### 3.2 Paleta cromática propuesta (HEX)

**Modo oscuro (base):**

| Rol | Token | HEX | Uso |
|---|---|---|---|
| Fondo base | `bg/base` | `#121212` | Fondo principal de app |
| Superficie 1 | `surface/raised` | `#1C1C1E` | Tarjetas, hojas, inputs |
| Superficie 2 | `surface/overlay` | `#2A2A2D` | Modales, menús, estados elevados |
| Texto primario | `text/primary` | `#F5F5F2` | Títulos y cuerpo principal |
| Texto secundario | `text/secondary` | `#A8A8A3` | Metadatos, ayudas |
| Acento / CTA | `accent/yellow` | `#F5C542` | Botón primario, enlaces, foco |
| Acento sobre oscuro | `accent/yellow-text` | `#1A1400` | Texto sobre amarillo |
| Énfasis / error | `accent/red` | `#E5484D` | Errores, alertas, acciones destructivas |
| Éxito | `semantic/success` | `#3FB950` | Confirmaciones |
| Advertencia | `semantic/warning` | `#D29922` | Estados que requieren atención |
| Borde sutil | `border/subtle` | `#3A3A3D` | Separadores, bordes de input |

**Modo claro:**

| Rol | Token | HEX |
|---|---|---|
| Fondo base | `bg/base` | `#F7F6F2` |
| Superficie 1 | `surface/raised` | `#FFFFFF` |
| Superficie 2 | `surface/overlay` | `#EFEDE6` |
| Texto primario | `text/primary` | `#1A1A18` |
| Texto secundario | `text/secondary` | `#5C5C58` |
| Acento / CTA | `accent/yellow` | `#B8860B` (amarillo oscurecido para contraste sobre claro) |
| Énfasis / error | `accent/red` | `#C42B2F` |
| Éxito | `semantic/success` | `#1F7A33` |
| Advertencia | `semantic/warning` | `#8A5A00` |
| Borde sutil | `border/subtle` | `#D6D3CA` |

**Justificación del ajuste en modo claro:** el amarillo brillante `#F5C542` sobre `#F7F6F2` no alcanza 4.5:1 para texto normal. No se debe “usar el mismo amarillo en ambos modos”; el acento debe cambiar de luminosidad para preservar contraste. Esta es una decisión de accesibilidad, no una preferencia estética.

### 3.3 Reglas de contraste y accesibilidad cromática

- **Texto normal:** mínimo 4.5:1; **texto grande** (≥ 24 px, o ≥ 18.66 px en negrita): mínimo 3:1.
- **Componentes no textuales** (iconos, bordes de inputs, indicadores de foco, controles): mínimo 3:1 contra colores adyacentes.
- **Estados de foco:** el indicador de foco debe ser visible y con contraste suficiente; no depender solo del color. Los estados enfocado/desenfocado deben distinguirse más allá del matiz.
- **Nunca usar rojo y verde como única diferencia** entre estados; acompañar con icono, texto o forma.
- **Amarillo sobre carbón** funciona como acento y CTA, pero el texto sobre amarillo debe ser oscuro (`#1A1400`), no blanco.

### 3.4 Tipografía

**Recomendación:** una familia principal de UI con eje óptico y buena legibilidad en tamaños pequeños. **Inter** fue creada específicamente para legibilidad en pantalla, con altura de x alta, aperturas abiertas y eje óptico variable que adapta el espaciado según el tamaño; además incluye figuras tabulares y soporte para más de 140 idiomas. Es una elección defendible para un producto académico: gratuita, open source, ampliamente probada y con pesos 100–900 en un solo archivo variable.

**Alternativa de personalidad:** una display condensada o neo-grotesca para títulos de concierto y cartelería, **solo en tamaños grandes**, nunca para cuerpo ni metadatos.

**Escala tipográfica propuesta (móvil, base 390 px):**

| Token | Tamaño / línea | Peso | Uso |
|---|---|---|---|
| `display/l` | 32 / 36 | 700–800 | Título de concierto en detalle |
| `heading/l` | 24 / 30 | 700 | Título de sección |
| `heading/m` | 20 / 26 | 600–700 | Encabezado de tarjeta |
| `body/l` | 17 / 24 | 400 | Cuerpo principal |
| `body/m` | 15 / 22 | 400–500 | Cuerpo secundario |
| `label/l` | 14 / 18 | 600 | Botones, tabs |
| `caption` | 12 / 16 | 500 | Metadatos, timestamps |

**Regla:** no bajar de 12 px para texto informativo. Los metadatos pueden usar `text/secondary`, pero nunca con contraste inferior a 4.5:1.

### 3.5 Espaciado, radios y elevación

- **Base de espaciado:** múltiplos de 4. Escala: 4, 8, 12, 16, 24, 32, 48.
- **Márgenes laterales móviles:** 16 px; en tablet 24 px; en desktop 32–48 px con contenedor máximo.
- **Radios:** `sm` 8, `md` 12, `lg` 16, `pill` 999. Las tarjetas de concierto usan `md` o `lg`; los botones usan `pill` o `md`.
- **Elevación:** en modo oscuro, la elevación se comunica con **superficie más clara + borde sutil**, no solo con sombra (las sombras son poco visibles sobre carbón).

### 3.6 Componentes y estados

**Botón primario:** fondo `accent/yellow`, texto `accent/yellow-text`, altura mínima 48 px, radio `pill` o `md`. **Estado presionado:** reducir luminosidad ~10 % y aplicar escala 0.98 si se implementa feedback táctil. **Estado deshabilitado:** fondo `border/subtle`, texto `text/secondary`, sin sombra; no usar opacidad global por debajo de 40 % si compromete legibilidad.

**Campos de input:** fondo `surface/raised`, borde `border/subtle`, altura mínima 48 px. **Foco:** borde `accent/yellow` de 2 px + sombra/glow sutil; el foco debe ser perceptible sin depender solo del color. **Error:** borde `accent/red`, mensaje textual debajo; el error nunca se comunica solo con color.

**Tarjetas de concierto:** superficie `surface/raised`, imagen con relación de aspecto fija (16:9 o 4:5), título en `heading/m`, metadatos en `caption` con `text/secondary`, estado de disponibilidad como chip semántico. **Estado guardado/favorito:** icono relleno vs. contorno, con cambio de color y animación de confirmación breve.

**Modales:** en móvil, **bottom sheet** en lugar de modal centrado para acciones contextuales; en desktop/tablet, modal centrado con ancho máximo 480–560 px. **Nunca** anidar más de un modal.

**Navegación inferior:** 3–5 destinos, icono + etiqueta, altura 56–64 px + safe area, fondo `surface/raised` con borde superior `border/subtle`. El destino activo usa `accent/yellow` y un indicador visual adicional (no solo color).

### 3.7 Iconografía e imágenes

- Iconos lineales de 24 px con grosor 2 px; relleno solo para estado activo. Evitar mezclar estilos.
- Para conciertos y artistas: fotografía con **tratamiento de contraste consistente** (ligero aumento de contraste y saturación controlada) para que imágenes de distintas fuentes convivan. No aplicar filtros que oculten información.
- Para espacios: planos o fotos arquitectónicas con overlay de carbón al 20–30 % solo si hay texto encima; verificar contraste del texto sobre la imagen en todos los casos.

### 3.8 Modo claro/oscuro

No es una inversión mecánica de colores. En claro, el acento amarillo se oscurece; las superficies ganan separación por borde y sombra suave; las imágenes pueden requerir un borde `border/subtle` para no “flotar”. **El modo oscuro no debe ser el único modo**: la accesibilidad y las condiciones de luz exterior exigen que el modo claro sea plenamente funcional.

### 3.9 Referencias visuales y qué adaptar (sin copiar)

- **DICE:** checkout móvil extremadamente rápido y descubrimiento in-app curado. Adaptable: reducir pasos en confirmación y usar jerarquía de un solo CTA por pantalla.
- **Resident Advisor:** autoridad de descubrimiento y filtros por escena/género; su rediseño de descubrimiento eliminó puntos de entrada redundantes. Adaptable: un solo punto de entrada claro a descubrimiento, no múltiples rutas duplicadas.
- **Eventbrite:** amplitud de categorías y checkout optimizado, pero con abandono en nightlife. Adaptable: claridad de progreso y costos desde el inicio, no al final.

**Lo que no se debe copiar:** la estética “todo negro” de algunas apps de música no es una estrategia de identidad; sin jerarquía de superficies, el resultado es plano y agotador. Tampoco se debe copiar la densidad de escritorio en móvil.


## 4. Propuesta de UX y arquitectura de navegación

### 4.1 Principio de arquitectura

La arquitectura debe organizarse por **intención del usuario**, no por el modelo de datos. “Conciertos”, “Espacios”, “Propuestas” y “Reservas” son entidades del dominio; el usuario piensa en “encontrar”, “publicar”, “gestionar mi participación” y “administrar”.

### 4.2 Navegación principal por rol

**Patrón general (móvil):** **bottom tabs visibles**, 3–5 destinos, con navegación secundaria en stack. Esto sitúa las acciones en la zona del pulgar: la parte inferior de la pantalla concentra la mayor precisión táctil (≈96 % en la zona inferior frente a ≈61 % en la zona superior), y la navegación visible se usa mucho más que la oculta.

**Asistente:**

- Tab 1: **Descubrir** (feed de conciertos, búsqueda, filtros).
- Tab 2: **Mis accesos / Mis conciertos** (entradas, historial).
- Tab 3: **Perfil**.

**Artista:**

- Tab 1: **Descubrir espacios / Oportunidades**.
- Tab 2: **Mis propuestas** (estados, seguimiento).
- Tab 3: **Mi perfil artístico**.

**Organizador:**

- Tab 1: **Panel** (resumen de conciertos, reservas y pendientes).
- Tab 2: **Conciertos** (crear, editar, publicar).
- Tab 3: **Espacios y reservas** (disponibilidad, propuestas).
- Tab 4: **Perfil**.

**Administrador:**

- Tab 1: **Pendientes** (cola de aprobaciones).
- Tab 2: **Conciertos**.
- Tab 3: **Usuarios y permisos**.
- Tab 4: **Configuración**.

**Usuario con permisos múltiples:** un **selector de contexto** en el perfil o en la cabecera del panel, no tabs duplicadas para cada rol. El usuario debe saber en qué contexto está y poder cambiarlo sin perder su lugar. Esto evita una navegación inflada y reduce errores de permisos.

### 4.3 Jerarquía de pantallas

1. **Nivel 0:** tabs principales.
2. **Nivel 1:** listado/sección dentro de un tab.
3. **Nivel 2:** detalle de entidad (concierto, espacio, propuesta, reserva).
4. **Nivel 3:** acciones específicas (crear/editar, confirmar, enviar propuesta).

**Regla:** ninguna tarea crítica debe requerir más de 3 niveles de profundidad desde un tab. Si un flujo necesita más, debe replantearse como un **flujo modal de pasos** con progreso visible, no como una pila de pantallas.

### 4.4 Flujos clave y reducción de pasos

**Registro e inicio de sesión:** email + contraseña o proveedor externo si ya está disponible. No añadir proveedores que no estén implementados. El registro debe pedir **solo lo necesario para el rol inicial**; el perfil se completa después, de forma progresiva. Un formulario de 3 campos es mejor que uno de 10 antes de que el usuario haya visto valor.

**Descubrimiento:** búsqueda con filtros persistentes (fecha, zona, género) y un estado vacío que explique qué filtro está limitando los resultados. Un solo punto de entrada claro, evitando rutas redundantes de descubrimiento.

**Detalle de concierto:** fecha, lugar, artistas, precio/condiciones y CTA visibles sin scroll. El CTA cambia según el estado: “Reservar”, “Ver entrada”, “Agotado”, “Cancelado”. El estado nunca debe quedar implícito.

**Creación de concierto (organizador):** flujo de 3 pasos con validación por paso: información básica → espacio/disponibilidad → confirmación. No permitir avanzar con datos inválidos, pero **no borrar lo ya ingresado** si el usuario vuelve atrás.

**Propuestas y presupuestos:** una propuesta debe mostrar **estado, fecha, contraparte y próximo paso**. Los estados deben ser explícitos: borrador, enviada, en revisión, aceptada, rechazada, vencida. El rechazo debe incluir motivo visible para el emisor.

**Reservas:** una reserva debe indicar **espacio, franja horaria, estado y conflicto si existe**. Si hay solapamiento, el sistema debe bloquear la acción antes de confirmar, no después.

**Administración:** vista de cola con contexto suficiente para decidir sin abrir cada elemento. Las acciones destructivas requieren confirmación explícita y, si es posible, deshacer.

### 4.5 Protección de rutas y permisos

Con Expo Router, todas las rutas están definidas; la protección se implementa con lógica en runtime y layouts anidados que redirigen a usuarios no autenticados o sin permiso. **Recomendación general:** centralizar la verificación de sesión y rol en un layout de nivel superior y no repetir comprobaciones dispersas. La UI debe ocultar o deshabilitar acciones no permitidas, pero la **autorización real debe ocurrir en backend**; ocultar un botón no es seguridad.

### 4.6 Patrones que se descartan y por qué

- **Menú hamburguesa como navegación principal:** reduce descubrimiento y ralentiza tareas; solo tiene sentido para secciones secundarias de baja frecuencia.
- **Tabs separadas por rol para usuarios multi-perfil:** infla la navegación y genera ambigüedad. Mejor un contexto activo explícito.
- **Pantallas intermedias de “confirmar que quieres continuar”:** añaden pasos sin valor. La confirmación debe reservarse para acciones irreversibles o con consecuencias externas.


## 5. Estrategia responsive

### 5.1 Principio

El responsive no es escalar la pantalla de escritorio hacia abajo. Cada breakpoint debe responder a **cómo cambia el contenido y la tarea**, no solo al ancho. Los breakpoints de 390 / 768 / 1024 / 1440 son puntos de referencia útiles, pero la regla preferida es **content-driven**: añadir un breakpoint donde el contenido se rompe.

### 5.2 Reglas por breakpoint

**390 px (móvil base):**

- Una columna. Tarjetas de concierto a ancho completo, imagen 16:9.
- Navegación inferior fija con safe area.
- Formularios de una columna; inputs de altura 48 px.
- Tablas: **no usar tablas**. Convertir en listas de tarjetas con campos clave.
- Modales: bottom sheets.
- Tipografía: base 15–17 px; títulos 24–32 px.

**768 px (tablet portrait / móvil grande):**

- Dos columnas para listados de conciertos; una columna para detalle.
- Navegación inferior se mantiene o se convierte en rail lateral si el ancho lo justifica; **no introducir un drawer solo porque hay más espacio**.
- Formularios pueden usar dos columnas para campos cortos, pero los campos de texto largo permanecen a ancho completo.
- Tablas simples pueden aparecer si son realmente tabulares (por ejemplo, reservas con fecha/estado), con columnas prioritarias.

**1024 px (tablet landscape / desktop pequeño):**

- Tres columnas en descubrimiento; panel lateral de filtros persistente.
- Navegación lateral (rail) para administración y organización, porque hay más destinos y el contexto es de gestión.
- Formularios en dos columnas con ancho máximo de campo para legibilidad.
- Tablas completas con columnas secundarias; permitir scroll horizontal solo si es inevitable.

**1440 px (desktop):**

- Contenedor máximo de 1200–1280 px centrado; el contenido no debe estirarse hasta los bordes.
- Grillas de 3–4 columnas; imágenes con `srcset`/variantes adecuadas.
- Paneles de detalle lado a lado (lista + detalle) para administración y organización.
- No aumentar el tamaño de fuente del cuerpo más allá de 17–18 px; aumentar el espacio en blanco, no el texto.

### 5.3 Reglas transversales

- **Áreas táctiles:** mínimo 44×44 pt en iOS y 48×48 dp en Android; usar `hitSlop` para ampliar controles visualmente pequeños.
- **Orientación:** no bloquear landscape en móvil salvo que una tarea lo requiera; verificar que los bottom sheets y teclados no rompan layouts.
- **Tipografía:** respetar escalado dinámico del sistema; evitar alturas fijas que recorten texto escalado.
- **Imágenes:** servir variantes por tamaño, no una imagen de escritorio reducida en CSS/estilo.
- **Ocultar vs. reorganizar:** ocultar información secundaria en móvil es aceptable; **ocultar acciones primarias no lo es**. Reorganizar es preferible a eliminar.


## 6. Estrategia de rendimiento y objetivos medibles

### 6.1 Distinción obligatoria

- **Objetivos de experiencia:** lo que el usuario debe percibir (inmediatez, fluidez, ausencia de bloqueos).
- **Métricas de laboratorio:** mediciones controladas en dispositivo/emulador y red simulada.
- **Métricas reales:** datos de usuarios en producción, con instrumentación y consentimiento.

No se presentan estimaciones como resultados medidos.

### 6.2 Umbrales de percepción como referencia

Los límites clásicos de respuesta son ~0.1 s (sensación de reacción instantánea), ~1.0 s (flujo de pensamiento mantenido) y ~10 s (límite antes de perder atención); para esperas de 1–10 s conviene usar skeletons o indicadores de progreso.

**Objetivos propuestos (no medidos aún):**

| Interacción | Objetivo de experiencia | Cómo medir |
|---|---|---|
| Feedback al presionar un botón | < 100 ms percibidos | Grabación de alta velocidad / trazas de UI |
| Navegación entre tabs | < 300 ms hasta contenido útil o skeleton | Trazas de navegación |
| Apertura de detalle desde listado | < 500 ms con skeleton inmediato | Trazas + observación |
| Carga inicial de listado | < 1 s en red razonable; skeleton si > 300 ms | Laboratorio con throttling |
| Imágenes en listado | Placeholder inmediato; imagen nítida progresiva | `expo-image` + métricas de carga |
| Búsqueda/filtros | < 500 ms para resultados; debounce si es remoto | Trazas de red y UI |

### 6.3 Listados y virtualización

**Problema:** los listados son el punto número uno de problemas de rendimiento en React Native; un scroll con jank arruina la experiencia completa.

**Recomendación general:**

- Usar `FlatList`/`SectionList` y, para listas grandes o heterogéneas, **FlashList** como reemplazo directo; su ventaja central es el **reciclaje de vistas** en lugar de crear y destruir componentes.
- `keyExtractor` estable (ID, no índice), `renderItem` memoizado, callbacks estables, `getItemLayout` si las alturas son fijas, `initialNumToRender` y `windowSize` razonables.
- Para listas heterogéneas, usar `getItemType` en FlashList para que los pools de reciclaje no mezclen tipos y se eviten recálculos costosos.

**Condicionado a inspección:** verificar si los listados actuales usan `ScrollView` con `.map()` (antipatrón crítico) o `FlatList` sin `keyExtractor`. No se puede afirmar sin revisar el repositorio.

### 6.4 Imágenes y multimedia

- Usar **`expo-image`** para caché, prioridad, placeholders y transiciones; especificar dimensiones para evitar saltos de layout; no decodificar imágenes a resolución completa en listas.
- Servir variantes de imagen por tamaño de renderizado. En web, `srcset`/`sizes` con descriptores de ancho permite al navegador elegir el recurso adecuado. En React Native, el equivalente práctico es solicitar al backend/CDN la variante correspondiente.
- Formatos modernos: AVIF con fallback a WebP/JPEG mediante negociación de contenido; AVIF puede lograr compresiones significativamente mayores que JPEG. **No se debe asumir que el backend actual soporta esto**; es una recomendación condicionada a la infraestructura de imágenes.
- Evitar autoplay de video en listados; usar thumbnail y cargar video solo en detalle bajo demanda.

### 6.5 Backend, MySQL y paginación

**Paginación:** para listados con scroll infinito o datasets grandes, **cursor/keyset** es preferible a offset. Offset escanea y descarta filas hasta el offset (`OFFSET 10000` examina 10 000 filas), mientras que cursor mantiene rendimiento aproximadamente O(log n) y consistencia ante escrituras concurrentes. Para un marketplace académico, esto es una decisión técnica defendible: no es sobre-ingeniería si el listado de conciertos crece.

**Condicionado a inspección:** revisar si los endpoints actuales usan `LIMIT/OFFSET` sin índices adecuados, si hay consultas N+1 y si las listas devuelven más campos de los necesarios. No se puede diagnosticar sin el repositorio.

**Caché:** cabeceras HTTP adecuadas para recursos estáticos; caché de respuestas de listados solo si la lógica de invalidación está clara. No introducir Redis u otra infraestructura sin necesidad demostrada.

### 6.6 Skeletons y estados de red

- Skeleton inmediato si el contenido tardará más de ~300 ms; para esperas de 1–10 s, skeleton o progreso; para > 10 s, indicador de progreso con explicación.
- Errores de red con reintento explícito y mensaje comprensible; no dejar pantallas en blanco.
- Evitar spinners indefinidos sin contexto. Un skeleton que refleja la estructura del contenido se percibe mejor que un spinner genérico.

### 6.7 Animaciones y presupuesto de rendimiento

Las animaciones complejas deben ejecutarse en el hilo de UI con `react-native-reanimated`, no en el hilo de JavaScript, para evitar jank. Cualquier animación que bloquee la interacción debe descartarse.


## 7. Animaciones y microinteracciones

### 7.1 Criterio

Una animación se justifica si **comunica un cambio de estado, mantiene el contexto espacial o confirma una acción**. Las animaciones puramente decorativas se descartan porque consumen presupuesto de rendimiento y pueden afectar a usuarios con trastornos vestibulares.

### 7.2 Propuestas con valor real

| Interacción | Qué comunica | Por qué conviene | Implementación |
|---|---|---|---|
| **Transición stack (push/pop)** | Relación jerárquica entre pantallas | Mantiene el modelo mental de profundidad | Transición nativa del stack; duración 250–300 ms |
| **Cambio de tab** | Cambio de sección, no de profundidad | Evita transiciones pesadas; el tab es un cambio de contexto plano | Cross-fade corto o ninguna animación; no simular push |
| **Guardar/favorito** | Confirmación inmediata de una acción | Reduce incertidumbre; feedback claro | Icono con cambio de relleno + escala sutil (spring corto) |
| **Envío de propuesta** | Acción con consecuencia externa | Confirma que la propuesta salió y quedó en estado “enviada” | Check + transición a estado; no animación de “avión de papel” |
| **Error de validación** | Localización del problema | Reduce errores y reintentos | Shake sutil del campo + mensaje; **no** sacudir toda la pantalla |
| **Confirmación de reserva** | Cambio de estado crítico | Evita dudas sobre si la reserva existe | Transición de estado con color semántico y resumen |
| **Skeleton → contenido** | Carga en progreso y estructura | Reduce percepción de espera | Cross-fade de 150–200 ms; sin desplazamientos grandes |

### 7.3 Accesibilidad y movimiento reducido

Se debe respetar `prefers-reduced-motion` (o el equivalente del sistema en React Native) y suprimir animaciones no esenciales cuando el usuario lo solicite; las animaciones de interacción pueden desencadenar trastornos vestibulares. Además, evitar flashes a más de 3 por segundo (WCAG 2.3.1) y no reproducir animaciones de más de 5 segundos sin control del usuario.

**Regla práctica:** implementar un hook/contexto de preferencia de movimiento y aplicar **dos variantes**: completa y reducida. La reducida no es “sin feedback”: es feedback sin desplazamiento ni escala pronunciada.

### 7.4 Lo que se descarta

- Animaciones de entrada de listas completas en cada scroll.
- Parallax en listados.
- Transiciones de “página volteada” o efectos 3D entre pantallas.
- Animaciones de carga de más de 1 s que retrasen la disponibilidad del contenido.


## 8. Perfeccionamiento funcional

### 8.1 Principios

Una funcionalidad solo se recomienda si: tiene utilidad real, puede completarse de extremo a extremo, es técnicamente viable con el stack declarado y puede probarse. No se proponen botones decorativos ni simulaciones presentadas como reales.

### 8.2 Registro y roles

- **Problema:** un registro que pide demasiado antes de dar valor genera abandono.
- **Solución:** registro mínimo + selección de rol inicial; perfil completable después. Para usuarios con permisos múltiples, un **contexto activo** explícito, no roles duplicados.
- **Validación:** email y campos obligatorios con mensajes específicos; no usar un mensaje genérico “error en el formulario”.

### 8.3 Conciertos

- **Problema:** estados ambiguos (borrador, publicado, cancelado) y publicación sin verificar disponibilidad.
- **Solución:** máquina de estados explícita; la publicación requiere espacio y fecha válidos; el organizador ve un resumen antes de publicar.
- **Comprobación:** crear un concierto, intentar publicarlo con fecha en el pasado y verificar que el sistema lo bloquea con un mensaje claro.

### 8.4 Espacios y reservas

- **Problema:** solapamiento de reservas y conflictos descubiertos tarde.
- **Solución:** validación de disponibilidad **antes** de confirmar; si hay conflicto, mostrar franjas alternativas. La reserva debe tener un identificador visible y un estado consistente.
- **Comprobación:** intentar reservar un espacio ya reservado en la misma franja; el flujo debe bloquearse con explicación, no fallar después del envío.

### 8.5 Propuestas y presupuestos

- **Problema:** el emisor no sabe qué pasa con su propuesta; el receptor no tiene contexto para decidir.
- **Solución:** estados explícitos con fecha y próximo paso; rechazo con motivo obligatorio; historial de cambios de estado visible para ambas partes.
- **Comprobación:** enviar una propuesta, rechazarla con motivo y verificar que el emisor ve el motivo y la fecha.

### 8.6 Notificaciones

- **Problema:** notificaciones genéricas que no indican qué acción se requiere.
- **Solución:** notificaciones vinculadas a entidades (“Tu propuesta para [espacio] fue aceptada”) y deep link a la pantalla correspondiente. No prometer notificaciones push si no están implementadas; en su defecto, usar estado dentro de la app.

### 8.7 Administración y permisos

- **Problema:** acciones destructivas sin confirmación; permisos verificados solo en UI.
- **Solución:** confirmación explícita para acciones irreversibles; registro de auditoría si es viable; autorización en backend. La UI puede ocultar acciones, pero el backend debe rechazarlas.

### 8.8 Consistencia y recuperación

- Mensajes de error que indiquen **qué pasó y qué hacer**, no solo “algo salió mal”.
- Preservar datos ingresados ante errores de red o validación.
- No usar modales para errores recuperables; usar mensajes inline junto al campo o a la acción.
- Evitar duplicar acciones: un solo CTA primario por pantalla; las acciones secundarias deben ser visualmente secundarias.


## 9. Matriz de mejoras priorizadas

**Escala:** Impacto (1–5), Esfuerzo (1–5, donde 5 es mayor esfuerzo), Riesgo (1–5, donde 5 es mayor riesgo). La prioridad se calcula como impacto relativo frente a esfuerzo y riesgo; los valores son estimaciones de planificación, no mediciones.

| # | Mejora | Problema que resuelve | Impacto | Esfuerzo | Riesgo | Dependencias | Comprobación |
|---|---|---|---|---|---|---|---|
| 1 | **Navegación inferior visible por rol** | Navegación oculta reduce descubrimiento y velocidad | 5 | 3 | 2 | Expo Router layouts; permisos | Prueba de usabilidad: tiempo y éxito en tareas de descubrimiento |
| 2 | **Sistema de color semántico con contraste verificado** | Colores sin función; riesgo de accesibilidad | 5 | 2 | 1 | Tokens de diseño | Auditoría de contraste en todos los estados |
| 3 | **Tipografía Inter con escala definida** | Legibilidad en tamaños pequeños | 4 | 2 | 1 | Carga de fuente variable | Revisión visual + pruebas en dispositivo |
| 4 | **FlashList para listados grandes** | Scroll con jank; renderizado costoso | 4 | 2 | 2 | Listados existentes | Medición de frames y scroll en dispositivo de gama baja |
| 5 | **expo-image con placeholders y dimensiones** | Imágenes que saltan y decodificación en main thread | 4 | 2 | 1 | Componente de tarjeta | Medición de tiempo de carga percibido |
| 6 | **Estados explícitos en propuestas/reservas** | Ambigüedad y soporte innecesario | 4 | 3 | 3 | Modelo de datos backend | Prueba de flujo completo con dos usuarios |
| 7 | **Validación de disponibilidad antes de confirmar reserva** | Conflictos descubiertos tarde | 4 | 3 | 3 | Lógica backend de franjas | Prueba de solapamiento |
| 8 | **Skeletons y errores de red con reintento** | Pantallas en blanco y espera percibida | 3 | 2 | 1 | Componentes de feedback | Prueba con red limitada |
| 9 | **Respeto de movimiento reducido** | Accesibilidad vestibular | 3 | 2 | 1 | Hook/contexto de preferencia | Prueba con preferencia activada |
| 10 | **Paginación cursor/keyset en listados** | Degradación con offsets grandes | 3 | 4 | 3 | Endpoints backend; índices MySQL | Pruebas de carga con dataset sintético |
| 11 | **Selector de contexto para multi-rol** | Navegación inflada y errores de permisos | 3 | 3 | 2 | Sesión y roles backend | Prueba con usuario multi-rol |
| 12 | **Bottom sheets en móvil en lugar de modales centrados** | Acciones contextuales incómodas | 2 | 2 | 1 | Componente de sheet | Prueba en dispositivos pequeños |

**Lectura de la matriz:** las mejoras 1–5 son de **alta prioridad y bajo riesgo**; deben formar parte de la primera etapa. Las mejoras 6–7 son de **alto impacto pero requieren trabajo de backend y definición de estados**; deben planificarse con cuidado. La mejora 10 (paginación cursor) es importante a escala, pero **no debe ser la primera intervención** si el dataset actual aún es pequeño: primero se mide, luego se decide.


## 10. Plan de implementación por etapas

### Etapa 0 — Auditoría y línea base (2–3 semanas)

- Inspeccionar repositorio, endpoints, esquema de datos y pantallas existentes.
- Medir línea base de rendimiento en laboratorio (listados, imágenes, navegación).
- Ejecutar la primera ronda de pruebas de usabilidad (5 por perfil).
- **Entregable:** informe de auditoría con hallazgos y decisiones pendientes.

### Etapa 1 — Fundamentos de identidad y accesibilidad (3–4 semanas)

- Tokens de color, tipografía, espaciado y radios.
- Componentes base: botón, input, tarjeta, chip de estado, bottom sheet, tab bar.
- Auditoría de contraste y estados de foco.
- **Entregable:** sistema de diseño mínimo implementado y documentado.

### Etapa 2 — Navegación y flujos críticos (4–6 semanas)

- Navegación inferior por rol y selector de contexto.
- Descubrimiento, detalle de concierto y estados vacíos.
- Flujo de propuesta y reserva con estados explícitos.
- Validación de disponibilidad antes de confirmar.
- **Entregable:** flujos críticos completables de extremo a extremo.

### Etapa 3 — Rendimiento y multimedia (3–4 semanas)

- FlashList en listados grandes; `expo-image` con placeholders.
- Skeletons, errores de red y reintentos.
- Revisión de endpoints y paginación (medir antes de cambiar).
- **Entregable:** mejoras medibles de fluidez y carga percibida.

### Etapa 4 — Motion, responsive y pulido (3–4 semanas)

- Microinteracciones priorizadas y variante de movimiento reducido.
- Reglas responsive en 390/768/1024/1440.
- Ajustes de modo claro/oscuro.
- **Entregable:** experiencia completa en los cuatro breakpoints, con motion accesible.

### Etapa 5 — Validación y cierre (2–3 semanas)

- Segunda ronda de usabilidad con tareas críticas.
- Comparación con línea base.
- Documentación de decisiones y limitaciones.
- **Entregable:** informe final defendible académicamente.


## 11. Plan de validación y pruebas

### 11.1 Pruebas de usabilidad formativas

- **Mínimo:** 5 participantes por perfil; **recomendado:** 8 por perfil para estabilizar.
- Tareas críticas definidas en la sección 2.4.
- Moderación con think-aloud; registro de tiempo, errores, pasos y confianza.
- **Criterio de éxito:** cada tarea se completa sin ayuda del moderador en al menos 4 de 5 participantes del perfil correspondiente.

### 11.2 Pruebas de accesibilidad

- Contraste de texto y componentes no textuales con herramienta de medición.
- Navegación con lector de pantalla en iOS (VoiceOver) y Android (TalkBack) en flujos críticos.
- Escalado dinámico de texto sin recortes.
- Preferencia de movimiento reducido activada: verificar que las animaciones no esenciales se suprimen.
- Áreas táctiles: mínimo 44×44 pt iOS / 48×48 dp Android.

### 11.3 Pruebas de rendimiento

- Dispositivo de gama baja y red simulada (3G rápida / 4G lenta).
- Medir: tiempo hasta contenido útil, frames por segundo en scroll, tiempo de carga de imágenes, tiempo de navegación entre tabs.
- Comparar antes/después de FlashList y `expo-image`.
- **No presentar resultados de laboratorio como métricas reales de usuarios.**

### 11.4 Pruebas funcionales de flujos

- Propuesta: enviar, recibir, aceptar, rechazar con motivo, verificar visibilidad del motivo.
- Reserva: intentar solapamiento, verificar bloqueo y alternativas.
- Concierto: crear, publicar con datos inválidos (debe bloquear), publicar válido.
- Permisos: usuario sin permiso intenta acceder por URL/ruta; el backend debe rechazar aunque la UI lo oculte.

### 11.5 Métricas de producción (futuro)

Si se instrumenta analítica, medir: finalización de flujos, abandono por pantalla, tiempo entre pasos, errores de validación, reintentos. **No usar mapas de calor como sustituto de pruebas con usuarios en esta etapa**; requieren volumen y consentimiento.


## 12. Riesgos, limitaciones y decisiones pendientes

### 12.1 Riesgos

- **Sobre-ingeniería:** introducir cursor pagination, CDN de imágenes o capas de caché antes de medir puede consumir tiempo académico sin beneficio demostrable. Mitigación: etapa 0 de medición y decisión basada en datos.
- **Identidad visual sin sistema:** si el amarillo y el rojo se usan sin roles semánticos, el resultado será ruidoso y fallará contraste. Mitigación: tokens y auditoría.
- **Permisos solo en UI:** ocultar un botón no es autorización. Mitigación: validación en backend.
- **Motion excesivo:** animaciones decorativas que afectan rendimiento y accesibilidad. Mitigación: criterio de valor + reduced motion.
- **Datos inventados:** presentar estimaciones como mediciones. Mitigación: distinguir explícitamente objetivos, laboratorio y producción.

### 12.2 Limitaciones

- No se ha inspeccionado el repositorio; no se puede afirmar qué está implementado ni qué falla.
- El alcance de “entradas/compra” depende de si el piloto incluye pago o solo reserva/acceso; debe aclararse antes de diseñar checkout.
- El soporte de formatos de imagen y CDN depende de la infraestructura de Aiven y del backend actual; no se asume.
- El volumen real de datos del piloto es desconocido; la paginación cursor puede no ser necesaria de inmediato.

### 12.3 Decisiones pendientes

1. ¿El piloto incluye compra de entradas con pago o solo reserva/acceso? Determina el flujo crítico y el nivel de seguridad requerido.
2. ¿Existen notificaciones push en el alcance? Si no, el estado dentro de la app debe ser la fuente de verdad.
3. ¿La analítica de eventos está permitida y disponible? Determina qué métricas reales se pueden medir.
4. ¿El backend actual soporta variantes de imagen o CDN? Determina si la optimización de imágenes es de frontend o de infraestructura.
5. ¿Los usuarios multi-rol son un caso real del piloto? Determina la prioridad del selector de contexto.


## 13. Fuentes y referencias

1. W3C — WCAG 2.2, Success Criterion 1.4.3 Contrast (Minimum): texto normal 4.5:1; texto grande 3:1.
2. W3C — WCAG 2.2, Success Criterion 1.4.11 Non-text Contrast: componentes no textuales y estados de foco 3:1.
3. W3C — Technique C39: `prefers-reduced-motion` para prevenir movimiento; relación con 2.3.3 Animation from Interactions.
4. Wikipedia / Inter typeface — familia diseñada para legibilidad en pantalla, altura de x alta, eje óptico variable, open source.
5. NN/g (vía Global Bridge Labs) — navegación oculta usada en 57 % vs. 86 % visible; caída >20 % en descubrimiento y 15 % más lentitud.
6. React Native / Expo performance patterns — FlashList como reemplazo de FlatList para listas grandes; `expo-image` con placeholder y dimensiones.
7. Shopify FlashList — reciclaje de vistas en lugar de crear/destruir; `getItemType` para listas heterogéneas.
8. React Native accessibility — touch targets 44×44 pt iOS / 48×48 dp Android; `hitSlop`; respeto de escalado dinámico.
9. Expo Router — autenticación y rutas protegidas mediante layouts anidados y redirección en runtime.
10. OneUptime / paginación MySQL — offset escanea y descarta filas; cursor/keyset mantiene rendimiento O(log n) y consistencia.
11. NN/g (vía referencias secundarias) — límites de respuesta ~0.1 s / 1 s / 10 s; skeletons o progreso para esperas de 1–10 s.
12. DICE vs Eventbrite vs RA — DICE lidera checkout móvil <10 s; Eventbrite con abandono en nightlife; RA con autoridad de descubrimiento.
13. Responsive breakpoints — estrategia content-driven preferible a anchos de dispositivo; 390/768/1024/1440 como referencias.
14. Imágenes responsive — `srcset`/`sizes` con descriptores de ancho para selección por el navegador.
15. CDN image optimization — negociación AVIF/WebP/JPEG; AVIF con compresión superior a JPEG.
16. React Native performance — animaciones en UI thread con Reanimated; animaciones JS bloquean interacciones.

---

**Nota final de honestidad intelectual:** este informe no afirma que Venti esté mal diseñado ni que su rendimiento sea deficiente. Afirma que **hay decisiones que pueden tomarse con base en evidencia externa sólida** (navegación visible, contraste, touch targets, virtualización de listas, movimiento reducido) y que **hay decisiones que requieren inspeccionar el repositorio y medir** (paginación, endpoints, estados de permisos, calidad de imágenes). La calidad del plan depende de mantener esa distinción.