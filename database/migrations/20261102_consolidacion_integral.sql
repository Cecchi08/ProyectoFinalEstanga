-- Consolidación funcional integral de Venti:
-- 1. Nuevas columnas de perfil comercial/contacto e imágenes en artist_profiles, service_providers y service_offerings.
-- 2. Tabla unificada artist_proposals para solicitudes y contrataciones entre Espacios Físicos (VENUE), Artistas (ARTISTA) y Organizadores (ORGANIZADOR).
-- 3. Consolidación de un único rol principal por usuario en user_roles y nombre en español para Espacio Físico (VENUE).
-- 4. Limpieza de etiquetas [DEMO] y carga de conciertos, espacios, servicios y propuestas reales de Mar del Plata y General Pueyrredón.
-- Aplicar con: node scripts/db-migrate.mjs --file ../database/migrations/20261102_consolidacion_integral.sql --backup ../.local/backups/venti-20261102-pre-consolidacion.sql --confirm venti
USE venti;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Ampliación de tablas existentes
ALTER TABLE artist_profiles
  ADD COLUMN phone VARCHAR(30) NULL AFTER website,
  ADD COLUMN contact_email VARCHAR(255) NULL AFTER phone;

ALTER TABLE service_providers
  ADD COLUMN logo_url VARCHAR(500) NULL AFTER coverage_area,
  ADD COLUMN primary_category_id SMALLINT UNSIGNED NULL AFTER logo_url,
  ADD KEY idx_service_providers_primary_cat (primary_category_id),
  ADD CONSTRAINT fk_service_providers_primary_cat FOREIGN KEY (primary_category_id) REFERENCES service_categories (id) ON DELETE SET NULL;

ALTER TABLE service_offerings
  ADD COLUMN image_url VARCHAR(500) NULL AFTER conditions;

-- 2. Tabla de propuestas y contrataciones de artistas (VENUE <-> ARTISTA y ORGANIZADOR -> ARTISTA)
CREATE TABLE IF NOT EXISTS artist_proposals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  flow_type ENUM('VENUE_TO_ARTIST', 'ARTIST_TO_VENUE', 'ORGANIZER_TO_ARTIST') NOT NULL,
  artist_profile_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NULL,
  establishment_id BIGINT UNSIGNED NULL,
  concert_id BIGINT UNSIGNED NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  event_title VARCHAR(200) NOT NULL,
  event_description TEXT NULL,
  genre_or_format VARCHAR(120) NULL,
  proposed_date DATETIME NOT NULL,
  proposed_end_date DATETIME NULL,
  expected_attendance INT UNSIGNED NULL,
  offered_amount DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  economic_terms VARCHAR(255) NULL,
  space_conditions TEXT NULL,
  technical_requirements TEXT NULL,
  message TEXT NULL,
  status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT NULL,
  responded_by_user_id BIGINT UNSIGNED NULL,
  responded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_artist_proposals_public_code (public_code),
  KEY idx_artist_proposals_artist (artist_profile_id, status),
  KEY idx_artist_proposals_venue (venue_id, status),
  KEY idx_artist_proposals_establishment (establishment_id, status),
  KEY idx_artist_proposals_sender (sender_user_id, status),
  KEY idx_artist_proposals_concert (concert_id),
  CONSTRAINT fk_artist_proposals_artist FOREIGN KEY (artist_profile_id) REFERENCES artist_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_artist_proposals_venue FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_proposals_establishment FOREIGN KEY (establishment_id) REFERENCES establishments (id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_proposals_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_proposals_sender FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_artist_proposals_responder FOREIGN KEY (responded_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_artist_proposals_amount CHECK (offered_amount IS NULL OR offered_amount >= 0)
) ENGINE=InnoDB;

-- 3. Consolidación de un único rol principal por usuario
UPDATE roles
SET name = 'Espacio Físico',
    description = 'Gestiona establecimientos y espacios físicos, responde presupuestos, reservas y contrataciones de artistas'
WHERE code = 'VENUE';

DELETE ur_buyer
FROM user_roles ur_buyer
JOIN roles r_buyer ON r_buyer.id = ur_buyer.role_id AND r_buyer.code = 'COMPRADOR'
WHERE EXISTS (
  SELECT 1
  FROM (SELECT user_id, role_id FROM user_roles) ur_other
  JOIN roles r_other ON r_other.id = ur_other.role_id
  WHERE ur_other.user_id = ur_buyer.user_id
    AND r_other.code IN ('ADMIN', 'ORGANIZADOR', 'VENUE', 'EMPRESA_SERVICIOS', 'ARTISTA')
);

-- 4. Limpieza de etiquetas [DEMO] y enriquecimiento de registros existentes
UPDATE organizations
SET name = 'Complejo Cultural Puerto Sonoro SRL',
    legal_name = 'Complejo Cultural Puerto Sonoro SRL',
    slug = 'complejo-puerto-sonoro-srl-54dab2',
    email = 'administracion@puertosonoro.com.ar'
WHERE id = 1;

UPDATE organizations
SET name = 'Atlántico Sonido e Iluminación',
    legal_name = 'Atlántico Técnica Escénica SRL',
    slug = 'atlantico-sonido-iluminacion-9c336d',
    email = 'ingenieria@atlanticosonido.com.ar'
WHERE id = 2;

UPDATE establishments
SET name = 'Complejo Puerto Sonoro',
    slug = 'complejo-puerto-sonoro-aacb81',
    description = 'Complejo cultural y salas de concierto frente a la Dársena B del Puerto de Mar del Plata. Escenario mayor con acústica tratada, camarines equipados y acceso técnico directo.',
    address_line = 'Av. Martínez de Hoz 4100, Puerto',
    email = 'reservas@puertosonoro.com.ar',
    website = 'https://puertosonoro.com.ar'
WHERE id = 1;

UPDATE venues
SET name = 'Sala Mayor Astor',
    slug = 'sala-mayor-astor-4ed49e',
    description = 'Sala principal para conciertos en vivo y ciclos musicales con sistema line array, parrilla de iluminación robotizada, barra y camarín privado.'
WHERE id = 1;

UPDATE venues
SET name = 'Sala Acústica y Ensayo Sur',
    slug = 'sala-acustica-ensayo-sur-d2d02b',
    description = 'Sala acustizada para ensayos de bandas, preproducción técnica y sesiones íntimas con backline completo incluido.'
WHERE id = 2;

UPDATE venue_photos
SET url = 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80'
WHERE venue_id = 1 AND is_cover = 1;

INSERT IGNORE INTO venue_photos (id, venue_id, url, sort_order, is_cover)
VALUES (2, 2, 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=1200&q=80', 0, 1);

UPDATE artist_profiles
SET stage_name = 'Los Prismas',
    slug = 'los-prismas-e1308a',
    bio = 'Banda marplatense de indie rock y synth-pop nacida frente a la costa atlántica. Con tres discos editados, combinan guitarras atmosféricas, sintetizadores analógicos y lírica urbana.',
    image_url = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    website = 'https://losprismas.com.ar',
    phone = '+54 223 582-4410',
    contact_email = 'booking@losprismas.com.ar'
WHERE id = 1;

UPDATE service_providers
SET description = 'Ingeniería de sonido en vivo, sistemas line array, diseño de iluminación escénica y pantallas LED para recitales, teatros y festivales en Mar del Plata y General Pueyrredón.',
    coverage_area = 'Mar del Plata, Batán, Chapadmalal y Sierra de los Padres',
    logo_url = 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1000&q=80',
    primary_category_id = 2
WHERE organization_id = 2;

UPDATE service_offerings
SET name = 'Sistema Line Array y Consola Digital 48 Canales',
    slug = 'sistema-line-array-consola-digital-5d0ddf',
    description = 'Cobertura integral de sonido PA y monitoreo in-ear para salas y eventos de hasta 1.500 espectadores, incluyendo dos operadores de FOH y escenario.',
    conditions = 'Incluye traslado en General Pueyrredón, armado 4 horas antes y prueba de sonido.',
    image_url = 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80'
WHERE id = 1;

UPDATE concerts
SET title = 'Los Prismas · Presentación de Marea Eléctrica',
    slug = 'los-prismas-marea-electrica-7ce5f4',
    artist_name = 'Los Prismas',
    description = 'Presentación oficial del nuevo álbum Marea Eléctrica con puesta audiovisual inmersiva y artistas invitados de la escena marplatense. Apertura de puertas 20:00 hs.',
    image_url = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    venue_name = 'Complejo Puerto Sonoro · Sala Mayor Astor',
    address_line = 'Av. Martínez de Hoz 4100, Puerto'
WHERE id = 1;

UPDATE concerts
SET title = 'Ciclo Acústico en los Jardines de Villa Victoria',
    slug = 'ciclo-acustico-villa-victoria-b17216',
    artist_name = 'Mar Adentro Trío',
    description = 'Velada íntima de canción rioplatense y arreglos de cámara bajo los árboles históricos del Centro Cultural Villa Victoria Ocampo.',
    image_url = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    venue_name = 'Centro Cultural Villa Victoria Ocampo',
    address_line = 'Matheu 1851, Los Troncos'
WHERE id = 2;

UPDATE concerts
SET title = 'Festival Sonidos del Atlántico · Edición Verano',
    slug = 'festival-sonidos-del-atlantico-97cd8a',
    artist_name = 'Los Prismas · Cielo Sur · DJ Bruma',
    description = 'Encuentro multidisciplinario frente al mar con bandas de General Pueyrredón, sets electrónicos al atardecer y producción escénica integral.',
    image_url = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80',
    venue_name = 'Explanada Playa Grande',
    address_line = 'Paseo Celso Aldao y Patricio Peralta Ramos'
WHERE id = 3;

UPDATE quotes
SET event_name = 'Presentación del álbum Marea Eléctrica · Los Prismas',
    event_description = 'Fecha lanzamiento con puesta de luces y grabación multipista en vivo.'
WHERE id = 1;

UPDATE reservations
SET event_name = 'Noche Los Prismas en Sala Mayor Astor'
WHERE id = 1;

UPDATE service_quotes
SET event_name = 'Los Prismas en vivo · Sonido PA Line Array'
WHERE id = 1;

UPDATE notifications
SET body = REPLACE(body, '[DEMO] ', '')
WHERE body LIKE '%[DEMO]%';

-- 5. Nuevos establecimientos y espacios musicales de Mar del Plata
INSERT IGNORE INTO establishments (id, organization_id, city_id, name, slug, description, address_line, postal_code, phone, email, website, status, published_at, reviewed_at, reviewed_by_user_id)
VALUES
  (2, 1, 1, 'Centro de Arte Radio City · Roxy', 'centro-arte-radio-city-roxy', 'Complejo teatral y musical en el corazón del microcentro marplatense con salas equipadas para conciertos sinfónicos, rock, jazz y festivales.', 'San Luis 1750, Centro', 'B7600', '+54 223 494-3988', 'programacion@centrodearte.com.ar', 'https://centrodearte.com.ar', 'PUBLISHED', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 4),
  (3, 1, 1, 'Club TRI & Estudio Faro', 'club-tri-estudio-faro', 'Espacio cultural independiente, escenario en vivo y estudio de grabación profesional en el corredor musical de Mar del Plata.', '20 de Septiembre 2650', 'B7600', '+54 223 541-9020', 'agenda@clubtrimdp.com.ar', 'https://clubtrimdp.com.ar', 'PUBLISHED', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 4);

INSERT IGNORE INTO venues (id, establishment_id, venue_type_id, name, slug, description, capacity_standing, capacity_seated, area_m2, price_per_hour, currency, min_booking_minutes, hold_minutes, status, published_at)
VALUES
  (3, 2, 5, 'Sala Teatro Radio City', 'sala-teatro-radio-city', 'Sala teatral principal con acústica de excelencia, foso de orquesta, 3 niveles de platea y sistema de sonido e iluminación profesional.', 1100, 900, 680.00, 85000.00, 'ARS', 120, 15, 'PUBLISHED', UTC_TIMESTAMP()),
  (4, 2, 6, 'Sala Auditorio Melany', 'sala-auditorio-melany', 'Auditorio íntimo ideal para ciclos acústicos, presentaciones de discos, jazz y música de cámara.', 300, 260, 240.00, 38000.00, 'ARS', 120, 15, 'PUBLISHED', UTC_TIMESTAMP()),
  (5, 3, 4, 'Escenario Principal Club TRI', 'escenario-principal-club-tri', 'Escenario con barra, sonido PA completo, luces LED y patio cultural para recitales de indie, electrónica, funk y rock.', 380, 140, 310.00, 32000.00, 'ARS', 120, 15, 'PUBLISHED', UTC_TIMESTAMP()),
  (6, 3, 3, 'Estudio Faro Grabación & Live Session', 'estudio-faro-grabacion-live', 'Sala de grabación multipista y sesiones en vivo con consola híbrida, microfonía condensadora y cabina aislada.', 25, 20, 85.00, 14500.00, 'ARS', 120, 15, 'PUBLISHED', UTC_TIMESTAMP());

INSERT IGNORE INTO venue_photos (id, venue_id, url, sort_order, is_cover)
VALUES
  (3, 3, 'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1200&q=80', 0, 1),
  (4, 4, 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=1200&q=80', 0, 1),
  (5, 5, 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80', 0, 1),
  (6, 6, 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80', 0, 1);

INSERT IGNORE INTO venue_amenities (venue_id, amenity_id)
VALUES
  (2, 1), (2, 3), (2, 9), (2, 11),
  (3, 1), (3, 2), (3, 4), (3, 5), (3, 8), (3, 9), (3, 10), (3, 12),
  (4, 1), (4, 2), (4, 4), (4, 5), (4, 8), (4, 9),
  (5, 1), (5, 2), (5, 3), (5, 4), (5, 6), (5, 11), (5, 12),
  (6, 1), (6, 3), (6, 9), (6, 10), (6, 11);

INSERT IGNORE INTO venue_opening_hours (venue_id, day_of_week, opens_at, closes_at)
VALUES
  (2, 1, '10:00:00', '23:00:00'), (2, 3, '10:00:00', '23:00:00'), (2, 5, '10:00:00', '23:59:00'),
  (3, 4, '16:00:00', '23:59:00'), (3, 5, '16:00:00', '23:59:00'), (3, 6, '16:00:00', '23:59:00'), (3, 7, '16:00:00', '23:59:00'),
  (4, 4, '17:00:00', '23:59:00'), (4, 5, '17:00:00', '23:59:00'), (4, 6, '17:00:00', '23:59:00'),
  (5, 4, '19:00:00', '23:59:00'), (5, 5, '19:00:00', '23:59:00'), (5, 6, '19:00:00', '23:59:00'),
  (6, 1, '09:00:00', '22:00:00'), (6, 2, '09:00:00', '22:00:00'), (6, 3, '09:00:00', '22:00:00'), (6, 4, '09:00:00', '22:00:00'), (6, 5, '09:00:00', '22:00:00');

-- 6. Nuevos servicios ofrecidos por Atlántico Sonido e Iluminación
INSERT IGNORE INTO service_offerings (id, organization_id, category_id, name, slug, description, equipment, conditions, image_url, pricing_unit, base_price, currency, status, published_at)
VALUES
  (2, 2, 3, 'Parrilla de Iluminación Robotizada y Operador DMX', 'parrilla-iluminacion-robotizada-dmx', 'Diseño y operación de puesta lumínica para conciertos en salas y espacios abiertos con cabezales móviles beam/wash y máquina de niebla.', '16 cabezales móviles, 12 pares LED RGBW, consola grandMA onPC, estructura truss 8 metros.', 'Incluye programación previa y operador durante todo el show.', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1200&q=80', 'EVENT', 180000.00, 'ARS', 'PUBLISHED', UTC_TIMESTAMP()),
  (3, 2, 6, 'Backline Profesional para Bandas (Batería + Amplificadores)', 'backline-profesional-bandas', 'Alquiler de equipamiento de escenario de primera línea para bandas en gira o ciclos en Mar del Plata y la costa.', 'Batería acústica 5 cuerpos con fierros, amplificador valvular de guitarra 50W, cabezal y caja de bajo 8x10, soporte para teclados.', 'Entrega y retiro en sala dentro de General Pueyrredón.', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80', 'DAY', 110000.00, 'ARS', 'PUBLISHED', UTC_TIMESTAMP()),
  (4, 2, 8, 'Registro Audiovisual Multicámara 4K en Vivo', 'registro-audiovisual-multicamara-4k', 'Cobertura fílmica de recitales a 3 cámaras 4K con captura de audio directo de consola y edición de aftermovie o sesión en vivo.', '3 cámaras Sony FX3, lentes luminosos, grabador multipista Zoom F8n, montaje y color grading.', 'Entrega de material editado en 7 días hábiles.', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80', 'EVENT', 145000.00, 'ARS', 'PUBLISHED', UTC_TIMESTAMP()),
  (5, 2, 5, 'Montaje de Escenario Modular y Vallado Perimetral', 'montaje-escenario-modular-vallado', 'Armado de escenario modular homologado con escalera, faldón ignífugo y vallado de contención para festivales.', 'Módulos de 2x1m antideslizantes hasta 10x6m, vallado free-standing 30 metros lineales.', 'Cotización final según dimensiones del predio y días de armado.', 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80', 'QUOTE', 320000.00, 'ARS', 'PUBLISHED', UTC_TIMESTAMP());

-- 7. Nuevos conciertos realistas en Mar del Plata y General Pueyrredón
INSERT IGNORE INTO concerts (id, organizer_user_id, title, slug, artist_name, description, image_url, city_id, venue_id, reservation_id, venue_name, address_line, doors_open_at, starts_at, ends_at, status, published_at)
VALUES
  (4, 5, 'Noche de Jazz & Brass frente al Puerto', 'noche-jazz-brass-club-tri', 'Sexteto Faro del Sur', 'Velada de hard bop, groove y composiciones originales inspiradas en la rambla marplatense. Servicio gastronómico y barra de autor.', 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=1200&q=80', 1, NULL, NULL, 'Escenario Principal Club TRI', '20 de Septiembre 2650', '2026-12-08 22:30:00', '2026-12-08 23:30:00', '2026-12-09 02:00:00', 'PUBLISHED', UTC_TIMESTAMP()),
  (5, 5, 'Sunset Electrónico en Acantilados de Chapadmalal', 'sunset-electronico-chapadmalal', 'Valentina Ríos · Kora Live Set', 'Atardecer frente al mar con live sets de house orgánico, sintetizadores modulares y visuales generativas en los acantilados del sur.', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80', 4, NULL, NULL, 'Parador Acantilados Sur', 'Ruta Provincial 11 Km 542, Chapadmalal', '2026-12-14 20:00:00', '2026-12-14 21:00:00', '2026-12-15 02:00:00', 'PUBLISHED', UTC_TIMESTAMP()),
  (6, 5, 'Gala de Tango Sinfónico · Homenaje a Piazzolla', 'gala-tango-sinfonico-piazzolla', 'Orquesta Típica Marplatense', 'Repertorio integral de las Cuatro Estaciones Porteñas y obras fundamentales de Astor Piazzolla interpretadas en su ciudad natal.', 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=1200&q=80', 1, NULL, NULL, 'Teatro Radio City · Sala Principal', 'San Luis 1750, Centro', '2026-12-19 23:00:00', '2026-12-20 00:00:00', '2026-12-20 02:30:00', 'PUBLISHED', UTC_TIMESTAMP()),
  (7, 5, 'Encuentro Folklórico de Sierra de los Padres', 'encuentro-folklorico-sierra-padres', 'Dúo Pampa y Mar · Invitados', 'Tarde de zambas, chacareras y música de raíz bonaerense al aire libre rodeados por las sierras del partido de General Pueyrredón.', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80', 3, NULL, NULL, 'Anfiteatro Natural de la Cumbre', 'Av. Argentina y Paseo de la Cumbre, Sierra de los Padres', '2027-01-10 20:00:00', '2027-01-10 21:00:00', '2027-01-11 00:30:00', 'PUBLISHED', UTC_TIMESTAMP()),
  (8, 5, 'Festival Urbano Puerto Activo', 'festival-urbano-puerto-activo', 'Marea Norte · Klan Costero · DJ Sismo', 'La nueva generación del hip hop, trap y R&B de la costa atlántica reunida en una noche de alto voltaje sonoro.', 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80', 1, NULL, NULL, 'Complejo Puerto Sonoro · Explanada Dársena', 'Av. Martínez de Hoz 4100, Puerto', '2027-01-17 22:00:00', '2027-01-17 23:00:00', '2027-01-18 03:00:00', 'PUBLISHED', UTC_TIMESTAMP()),
  (9, 5, 'Sesiones de Verano · Indie & Synthwave', 'sesiones-verano-indie-synthwave', 'Los Prismas', 'Show especial de formato extendido recorriendo toda la discografía de Los Prismas con invitados de la escena indie nacional.', 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80', 1, NULL, NULL, 'Sala Auditorio Melany · Centro de Arte', 'San Luis 1750, Centro', '2027-01-24 23:00:00', '2027-01-25 00:00:00', '2027-01-25 02:30:00', 'PUBLISHED', UTC_TIMESTAMP());

INSERT IGNORE INTO concert_genres (concert_id, genre_id)
VALUES
  (4, 4), (4, 5),
  (5, 3), (5, 13),
  (6, 7), (6, 14),
  (7, 6),
  (8, 9), (8, 10),
  (9, 1), (9, 13);

INSERT IGNORE INTO concert_artists (concert_id, artist_profile_id, billing_order)
VALUES
  (9, 1, 1);

INSERT IGNORE INTO ticket_types (id, concert_id, name, description, price, currency, quantity_total, quantity_sold, max_per_order, sales_start_at, sales_end_at, is_active)
VALUES
  (5, 4, 'Entrada General', 'Acceso general por orden de llegada', 14000.00, 'ARS', 250, 0, 6, NULL, '2026-12-08 22:00:00', 1),
  (6, 4, 'Mesa Preferencial Frente a Escenario', 'Ubicación en sector preferencial', 24000.00, 'ARS', 60, 0, 4, NULL, '2026-12-08 22:00:00', 1),
  (7, 5, 'Acceso General Sunset', 'Ingreso desde las 17:00 hs', 22000.00, 'ARS', 350, 0, 6, NULL, '2026-12-14 19:00:00', 1),
  (8, 5, 'Sector Deck VIP frente al Mar', 'Acceso prioritario y terraza exclusiva', 42000.00, 'ARS', 80, 0, 4, NULL, '2026-12-14 19:00:00', 1),
  (9, 6, 'Platea Baja Numerada', 'Ubicación central en planta baja', 28000.00, 'ARS', 450, 0, 6, NULL, '2026-12-19 22:00:00', 1),
  (10, 6, 'Pullman Superior', 'Visión panorámica en primer piso', 19500.00, 'ARS', 350, 0, 6, NULL, '2026-12-19 22:00:00', 1),
  (11, 7, 'Entrada General', 'Acceso al anfiteatro natural', 12000.00, 'ARS', 300, 0, 6, NULL, '2027-01-10 19:00:00', 1),
  (12, 7, 'Sector Preferencial Sombra', 'Ubicación en gradas centrales', 18500.00, 'ARS', 100, 0, 4, NULL, '2027-01-10 19:00:00', 1),
  (13, 8, 'Campo General', 'Acceso general al predio del puerto', 16500.00, 'ARS', 500, 0, 6, NULL, '2027-01-17 21:00:00', 1),
  (14, 8, 'Campo Delantero', 'Sector vallado frente al escenario principal', 30000.00, 'ARS', 120, 0, 4, NULL, '2027-01-17 21:00:00', 1),
  (15, 9, 'Butaca General', 'Ubicación en sala principal', 15500.00, 'ARS', 200, 0, 6, NULL, '2027-01-24 22:00:00', 1),
  (16, 9, 'Pase Preferencial + Prueba de Sonido', 'Incluye ingreso al soundcheck 18:30 hs', 29000.00, 'ARS', 40, 0, 2, NULL, '2027-01-24 22:00:00', 1);

-- 8. Perfiles artísticos adicionales de Mar del Plata y General Pueyrredón
INSERT IGNORE INTO artist_profiles (id, stage_name, slug, bio, city_id, image_url, website, phone, contact_email, status, published_at, created_by_user_id)
VALUES
  (2, 'Sexteto Faro del Sur', 'sexteto-faro-del-sur', 'Ensamble marplatense de hard bop, jazz contemporáneo y groove formado por vientos y sección rítmica del Conservatorio Luis Gianneo.', 1, 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=1200&q=80', 'https://farodelsurjazz.com.ar', '+54 223 519-8830', 'contacto@farodelsurjazz.com.ar', 'PUBLISHED', UTC_TIMESTAMP(), 8),
  (3, 'Kora Live Set', 'kora-live-set', 'Proyecto audiovisual de house orgánico, sintetizadores modulares y percusión electrónica nacido en los acantilados de Chapadmalal.', 4, 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80', 'https://koraliveset.com.ar', '+54 223 604-1129', 'booking@koraliveset.com.ar', 'PUBLISHED', UTC_TIMESTAMP(), 8),
  (4, 'Orquesta Típica Marplatense', 'orquesta-tipica-marplatense', 'Formación de 12 músicos dedicada al tango contemporáneo y a la obra sinfónica y de cámara de Astor Piazzolla.', 1, 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=1200&q=80', 'https://orquestamarplatense.org.ar', '+54 223 475-2201', 'produccion@orquestamarplatense.org.ar', 'PUBLISHED', UTC_TIMESTAMP(), 8),
  (5, 'Dúo Pampa y Mar', 'duo-pampa-y-mar', 'Dúo acústico de música folklórica bonaerense, zambas y canción de raíz con base en Sierra de los Padres.', 3, 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80', 'https://pampaymar.com.ar', '+54 223 544-7712', 'duopampaymar@venti.local', 'PUBLISHED', UTC_TIMESTAMP(), 8),
  (6, 'Marea Norte', 'marea-norte', 'Colectivo de hip hop, R&B y beats costeros con presentaciones en el Puerto de Mar del Plata y festivales bonaerenses.', 1, 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80', 'https://mareanorte.com.ar', '+54 223 621-9045', 'mgmt@mareanorte.com.ar', 'PUBLISHED', UTC_TIMESTAMP(), 8);

INSERT IGNORE INTO artist_members (artist_profile_id, user_id, member_role)
VALUES
  (2, 8, 'OWNER'),
  (3, 8, 'OWNER'),
  (4, 8, 'OWNER'),
  (5, 8, 'OWNER'),
  (6, 8, 'OWNER');

INSERT IGNORE INTO artist_profile_genres (artist_profile_id, genre_id)
VALUES
  (2, 4), (2, 5),
  (3, 3), (3, 13),
  (4, 7), (4, 14),
  (5, 6),
  (6, 9), (6, 10);

INSERT IGNORE INTO concert_artists (concert_id, artist_profile_id, billing_order)
VALUES
  (4, 2, 1),
  (5, 3, 1),
  (6, 4, 1),
  (7, 5, 1),
  (8, 6, 1),
  (9, 1, 1);

-- 9. Propuestas y contrataciones iniciales (VENUE <-> ARTISTA y ORGANIZADOR -> ARTISTA)
INSERT IGNORE INTO artist_proposals (
  id, public_code, flow_type, artist_profile_id, venue_id, establishment_id, concert_id, sender_user_id,
  event_title, event_description, genre_or_format, proposed_date, proposed_end_date, expected_attendance,
  offered_amount, currency, economic_terms, space_conditions, technical_requirements, message,
  status, responded_by_user_id, responded_at
) VALUES
  (
    1, 'C-9A41F2B0', 'VENUE_TO_ARTIST', 1, 1, 1, 1, 6,
    'Apertura Ciclo Puerto en Vivo · Los Prismas',
    'Fecha estelar de apertura del ciclo de primavera en Sala Mayor Astor con producción técnica integral.',
    'Show eléctrico completo (90 min)',
    '2026-11-24 21:00:00', '2026-11-24 23:55:00', 500,
    420000.00, 'ARS',
    'Cachet fijo + 20% de boletería luego de cubrir costos operativos.',
    'Sonido PA line array, parrilla de luces robotizadas, camarín privado y técnica de escenario incluidos.',
    'Consola digital 32 canales, 4 mezclas de monitoreo in-ear, backline de batería y amplificación.',
    '¡Hola Valentina! Queremos contar con Los Prismas como banda principal de apertura en Sala Mayor Astor.',
    'ACCEPTED', 8, UTC_TIMESTAMP()
  ),
  (
    2, 'C-7B22D4E1', 'VENUE_TO_ARTIST', 1, 5, 3, NULL, 6,
    'Sesión Íntima Synth & Guitarra en Club TRI',
    'Noche especial de viernes en el escenario principal de Club TRI con capacidad para 380 personas.',
    'Formato electro-acústico (75 min)',
    '2026-12-18 22:00:00', '2026-12-19 01:00:00', 320,
    280000.00, 'ARS',
    'Cachet garantizado + consumiciones de camarín y operador de sonido de la sala.',
    'Escenario principal Club TRI con barra cultural, sonido PA y luces LED.',
    'Sistema PA estéreo, 2 envíos de monitoreo de piso y 4 canales DI para sintetizadores.',
    'Nos encantaría recibirlos en diciembre para cerrar el año con un set íntimo en Club TRI.',
    'PENDING', NULL, NULL
  ),
  (
    3, 'C-5E89A1C3', 'ARTIST_TO_VENUE', 1, 3, 2, NULL, 8,
    'Grabación en Vivo · 5 Años de Los Prismas',
    'Celebración de los 5 años de la banda en el Teatro Radio City con registro multicámara en vivo.',
    'Recital aniversario con grabación audiovisual',
    '2027-02-06 21:30:00', '2027-02-07 00:30:00', 850,
    520000.00, 'ARS',
    'Propuesta de coproducción 70/30 sobre boletería neta o alquiler con tarifa artística preferencial.',
    'Uso de Sala Teatro Radio City con prueba de sonido extendida desde las 15:00 hs.',
    'Split de consola para grabación multipista a 32 canales y 3 posiciones fijas para cámaras 4K.',
    'Hola Lucía, buscamos reservar o coproducir nuestra fecha aniversario de verano en la Sala Teatro Radio City.',
    'PENDING', NULL, NULL
  ),
  (
    4, 'C-3D10E8F7', 'ORGANIZER_TO_ARTIST', 1, 1, 1, 3, 5,
    'Festival Sonidos del Atlántico · Cierre Escenario Mar',
    'Participación como banda de cierre del Festival Sonidos del Atlántico organizado por Martín Quiroga.',
    'Headliner cierre de festival (60 min)',
    '2026-12-24 21:00:00', '2026-12-24 23:30:00', 600,
    600000.00, 'ARS',
    '50% a la firma de confirmación y 50% antes de subir al escenario.',
    'Escenario principal con acceso exclusivo, camarín climatizado y traslado local de equipamiento.',
    'Rider técnico completo de festival, prueba de sonido 16:00 hs y monitoreo in-ear estéreo.',
    'Hola Los Prismas, les enviamos la propuesta formal para encabezar el cierre del Festival Sonidos del Atlántico.',
    'PENDING', NULL, NULL
  );

INSERT IGNORE INTO notifications (id, user_id, type, title, body, data, concert_id)
VALUES
  (17, 6, 'SYSTEM', 'Contratación confirmada por el artista', 'Los Prismas aceptó la propuesta para Apertura Ciclo Puerto en Vivo en Sala Mayor Astor (C-9A41F2B08E11).', JSON_OBJECT('proposal_id', '1', 'flow_type', 'VENUE_TO_ARTIST', 'sender_name', 'Los Prismas', 'entity_label', 'Sala Mayor Astor'), 1),
  (18, 8, 'SYSTEM', 'Nueva propuesta de espacio físico', 'Complejo Puerto Sonoro / Club TRI te envió una propuesta para Sesión Íntima Synth & Guitarra en Club TRI (C-7B22D4E19C02).', JSON_OBJECT('proposal_id', '2', 'flow_type', 'VENUE_TO_ARTIST', 'sender_name', 'Lucía Benítez · Club TRI', 'entity_label', 'Escenario Principal Club TRI'), NULL),
  (19, 6, 'SYSTEM', 'Nueva solicitud de fecha de un artista', 'Los Prismas envió una propuesta para presentarse en Sala Teatro Radio City: Grabación en Vivo · 5 Años de Los Prismas (C-5E89A1C34F03).', JSON_OBJECT('proposal_id', '3', 'flow_type', 'ARTIST_TO_VENUE', 'sender_name', 'Valentina Ríos · Los Prismas', 'entity_label', 'Sala Teatro Radio City'), NULL),
  (20, 8, 'SYSTEM', 'Nueva propuesta de contratación de organizador', 'Martín Quiroga te envió una propuesta artística para Festival Sonidos del Atlántico · Cierre Escenario Mar (C-3D10E8F72A04).', JSON_OBJECT('proposal_id', '4', 'flow_type', 'ORGANIZER_TO_ARTIST', 'sender_name', 'Martín Quiroga (Organizador)', 'entity_label', 'Festival Sonidos del Atlántico'), 3);

