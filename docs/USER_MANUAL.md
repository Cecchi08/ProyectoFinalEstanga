# Manual de usuario — VENTI

## Acceso y navegación

Registrate con nombre, apellido, email y contraseña de al menos 12 caracteres (hasta 72 bytes). Abrí el email de verificación y confirmá el formulario. Luego ingresá con email/contraseña; Google, GitHub y Facebook requieren configuración del responsable. Si olvidaste la contraseña, usá **Olvidé mi contraseña** y el último enlace recibido.

En escritorio las secciones aparecen a la izquierda. En teléfono/tablet, desplazá horizontalmente la barra inferior para ver todas. Los menús dependen de tus roles. **Mi cuenta → Cerrar sesión** termina el acceso local.

## USER

1. En **Descubrir**, buscá por nombre o aplicá filtros. Abrí el concierto para consultar fecha, lugar, artistas y entradas.
2. Guardá o quitá el favorito. **Favoritos** conserva la selección entre dispositivos; un concierto que deje de ser público puede dejar de aparecer.
3. Indicá cantidades y elegí **Reservar entradas**. Revisá total y vencimiento; **Confirmar compra** emite las entradas. No hay cobro bancario. Una reserva vence como máximo a los 15 minutos y puede vencer antes por cierre de venta.
4. En **Entradas**, mostrale al Staff el QR individual. Cada QR admite un solo ingreso; no lo compartas. **Actualizar entradas** refleja el estado después del escaneo.
5. En **Mi cuenta → Historial de compras**, consultá las compras. Para cancelar, confirmá la acción. Una compra usada no se puede cancelar; una confirmada sin uso se devuelve internamente cuando las reglas del concierto lo permiten.
6. **Venti Discover** muestra sugerencias y su motivo. Activá/desactivá recomendaciones desde allí o Mi cuenta. Sin historial, ofrece próximos eventos; puede quedar vacío si no hay candidatos.
7. En **Notificaciones**, abrí el concierto/compra asociado, marcá un aviso o todos como leídos. Podés desactivar avisos opcionales; confirmaciones y cambios relevantes de tus compras se mantienen.

## ORGANIZER

1. **Organizer → Crear concierto**: completá nombre, fecha futura con zona horaria, venue, tipo, artistas y géneros. Ejemplo de formato: `2027-06-10T23:00:00-03:00`; elegí una fecha futura al demostrar.
2. Guardá el borrador. Agregá tipos de entrada con nombre, precio, cupo y, opcionalmente, ventana de venta/máximo por compra.
3. **Publicar concierto** lo habilita para descubrimiento. Debe tener artista, género y un tipo de entrada válido; cargá cupo para permitir reservas.
4. Editá datos o entradas mientras estado/fecha lo permitan. El cupo no puede bajar de lo comprometido. Para cancelar, confirmá la acción; se conserva el historial y se notifican los afectados. Cancelar un concierto no devuelve automáticamente todas las compras.
5. **Ver estadísticas** muestra ventas confirmadas, recaudación histórica, entradas utilizadas/pendientes y ocupación. Filtrá por fecha de creación de compra (UTC) y concierto propio.

Los catálogos los prepara ADMIN. El responsable de instalación asigna previamente el Staff al concierto; ORGANIZER no tiene una pantalla de asignación de personal.

## STAFF

1. Entrá a **Staff** y seleccioná un concierto asignado. **Actualizar conciertos** recupera nuevas asignaciones.
2. Consultá asistentes; cada fila representa una entrada y muestra el nombre del comprador.
3. En Android/iOS, **Escanear con cámara** solicita permiso. También podés ingresar el token manualmente; en Web/Desktop usá ese campo o un lector USB que escriba el QR y presione Enter.
4. **Entrada válida · Ingreso registrado** confirma el acceso. Tocá **Siguiente entrada** para continuar.
5. **Entrada ya utilizada**, **otro concierto**, **cancelada**, **inválida** o **sin asignación** significan que no se registró un nuevo ingreso. El segundo escaneo del mismo QR se rechaza.

## ADMIN

1. **Admin** permite crear/editar/eliminar provincias, ciudades, venues, géneros y artistas. Prepará ubicaciones en orden provincia → ciudad → venue. Un registro referenciado puede rechazar eliminación.
2. **Gestionar todos los conciertos** permite administrar conciertos respetando estados, fechas y stock. Al crear, indicá un organizador con perfil habilitado.
3. **Estadísticas globales** incluye métricas de plataforma y filtros de ventas. Un ADMIN sin rol ORGANIZER usa este panel global.
4. **Staff** permite seleccionar conciertos y validar entradas sin asignación individual.

Roles y asignaciones se preparan mediante [Instalación](INSTALLATION.md); no existe una pantalla de gestión de usuarios.

## Mensajes frecuentes

| Situación | Acción |
| --- | --- |
| Sin resultados | Limpiá filtros o revisá si existen eventos publicados. |
| Sin conexión/error de carga | Recuperá conexión y usá **Reintentar**. |
| Reserva vencida/sin stock | Volvé al concierto y consultá disponibilidad. |
| Sesión vencida | Ingresá nuevamente. |
| Sin permiso | Consultá al responsable por tu rol/asignación. |
| Demasiadas solicitudes | Esperá antes de reintentar. |

## Demostración académica

Prepará cuatro cuentas verificadas, catálogos y asignación Staff ([SQL](INSTALLATION.md#cuentas-y-asignaciones-para-la-demostración)). Publicá dos conciertos futuros para que queden recomendaciones tras comprar uno.

1. ORGANIZER crea y publica un concierto con entradas.
2. USER lo descubre, reserva, confirma y muestra el QR.
3. STAFF valida; vuelve a escanear y recibe rechazo.
4. ORGANIZER consulta estadísticas: una venta y un ingreso.
5. USER revisa confirmación en Notificaciones y sugerencias en Venti Discover.
6. ADMIN muestra catálogos, gestión global y estadísticas.

Usá ventanas privadas separadas por cuenta o cerrá sesión entre roles.
