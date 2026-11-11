SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET @venti_promo_seeds = COALESCE(@venti_promo_seeds, 1);
SET @venti_promo_step = 'INICIO';
SET @vp_migration_error = NULL;
SET @vp_failed_step = NULL;
SET @vp_last_err = NULL;

-- ---------------------------------------------------------------------
-- 0. Validación de base de datos activa antes de crear procedimientos
-- ---------------------------------------------------------------------
SET @vp_precheck_sql = IF(
  DATABASE() IS NULL,
  'SELECT * FROM information_schema.__VENTI_DATABASE_NOT_SELECTED_20261110__',
  'DO 1'
);
PREPARE _vp_precheck_stmt FROM @vp_precheck_sql;
EXECUTE _vp_precheck_stmt;
DEALLOCATE PREPARE _vp_precheck_stmt;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Helpers temporales (prefijo _vp_). Se eliminan al terminar tanto en éxito como en error.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _vp_abort$$
CREATE PROCEDURE _vp_abort(IN p_msg TEXT)
BEGIN
  SET @vp_last_err = SUBSTRING(p_msg, 1, 128);
  SELECT p_msg AS migracion_abortada;
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @vp_last_err;
END$$

DROP PROCEDURE IF EXISTS _vp_exec$$
CREATE PROCEDURE _vp_exec(IN p_sql TEXT)
BEGIN
  SET @vp_sql = p_sql;
  PREPARE vp_stmt FROM @vp_sql;
  EXECUTE vp_stmt;
  DEALLOCATE PREPARE vp_stmt;
END$$

-- Columna: si no existe la agrega. Si existe, exige tipo, nulabilidad, default y extras compatibles.
DROP PROCEDURE IF EXISTS _vp_ensure_column$$
CREATE PROCEDURE _vp_ensure_column(
  IN p_table VARCHAR(64),
  IN p_col VARCHAR(64),
  IN p_def TEXT,
  IN p_type VARCHAR(200),
  IN p_nullable VARCHAR(3),
  IN p_default TEXT,
  IN p_extra VARCHAR(50)
)
BEGIN
  DECLARE v_type TEXT DEFAULT NULL;
  DECLARE v_null VARCHAR(3) DEFAULT NULL;
  DECLARE v_def TEXT DEFAULT NULL;
  DECLARE v_extra VARCHAR(50) DEFAULT NULL;

  SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    INTO v_type, v_null, v_def, v_extra
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col;

  IF v_type IS NULL THEN
    IF p_def IS NULL THEN
      CALL _vp_abort(CONCAT('Falta la columna obligatoria ', p_table, '.', p_col, ' en una tabla preexistente. Completar a mano o renombrar la tabla preexistente y re-ejecutar.'));
    END IF;
    CALL _vp_exec(CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def));
  ELSE
    IF LOWER(v_type) <> LOWER(p_type) OR v_null <> p_nullable THEN
      CALL _vp_abort(CONCAT('Columna incompatible ', p_table, '.', p_col, ': existe como ', v_type,
        ' nullable=', v_null, ' y se esperaba ', p_type, ' nullable=', p_nullable,
        '. No se modifica automáticamente para preservar la integridad de datos.'));
    END IF;
    IF p_default IS NOT NULL THEN
      IF v_def IS NULL OR (LOWER(v_def) <> LOWER(p_default) AND NOT (p_default IN ('0', '0.00') AND v_def IN ('0', '0.00'))) THEN
        CALL _vp_abort(CONCAT('Columna con valor default incompatible ', p_table, '.', p_col, ': existe con default [', COALESCE(v_def, 'NULL'),
          '] y se esperaba [', p_default, ']. Se requiere revisión manual antes de continuar.'));
      END IF;
    END IF;
    IF p_extra IS NOT NULL AND LOWER(COALESCE(v_extra, '')) NOT LIKE CONCAT('%', LOWER(p_extra), '%') THEN
      CALL _vp_abort(CONCAT('Columna con atributo extra incompatible ', p_table, '.', p_col, ': existe con extra [', COALESCE(v_extra, ''),
        '] y se esperaba [', p_extra, '].'));
    END IF;
  END IF;
END$$

-- Indice: verifica orden estricto de columnas, unicidad, prefijos (SUB_PART) y tipo de índice (BTREE).
DROP PROCEDURE IF EXISTS _vp_ensure_index$$
CREATE PROCEDURE _vp_ensure_index(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_cols VARCHAR(255),
  IN p_unique TINYINT
)
BEGIN
  DECLARE v_cols TEXT DEFAULT NULL;
  DECLARE v_nonunique INT DEFAULT NULL;
  DECLARE v_type VARCHAR(20) DEFAULT NULL;

  SELECT
    GROUP_CONCAT(CONCAT(COLUMN_NAME, IF(SUB_PART IS NOT NULL, CONCAT('(', SUB_PART, ')'), '')) ORDER BY SEQ_IN_INDEX SEPARATOR ','),
    MAX(NON_UNIQUE),
    MAX(INDEX_TYPE)
    INTO v_cols, v_nonunique, v_type
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index;

  IF v_cols IS NULL THEN
    CALL _vp_exec(CONCAT('ALTER TABLE `', p_table, '` ADD ', IF(p_unique = 1, 'UNIQUE ', ''), 'KEY `', p_index,
      '` (`', REPLACE(p_cols, ',', '`,`'), '`)'));
  ELSE
    IF LOWER(v_cols) <> LOWER(p_cols) OR v_nonunique <> IF(p_unique = 1, 0, 1) OR LOWER(COALESCE(v_type, 'btree')) <> 'btree' THEN
      CALL _vp_abort(CONCAT('Indice incompatible ', p_table, '.', p_index, ': existe sobre (', v_cols,
        ') unico=', IF(v_nonunique = 0, 'SI', 'NO'), ', tipo=', v_type,
        ' y se esperaba (', p_cols, ') unico=', IF(p_unique = 1, 'SI', 'NO'),
        '. No se elimina ni recrea automáticamente para evitar bloqueos y fallos de integridad.'));
    END IF;
  END IF;
END$$

-- Clave foránea: siempre ON DELETE RESTRICT ON UPDATE RESTRICT.
DROP PROCEDURE IF EXISTS _vp_ensure_fk$$
CREATE PROCEDURE _vp_ensure_fk(
  IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_col VARCHAR(64),
  IN p_ref_table VARCHAR(64), IN p_ref_col VARCHAR(64)
)
BEGIN
  DECLARE v_n INT DEFAULT 0;
  DECLARE v_col VARCHAR(64) DEFAULT NULL;
  DECLARE v_rtable VARCHAR(64) DEFAULT NULL;
  DECLARE v_rschema VARCHAR(64) DEFAULT NULL;
  DECLARE v_rcol VARCHAR(64) DEFAULT NULL;
  DECLARE v_del VARCHAR(20) DEFAULT NULL;
  DECLARE v_upd VARCHAR(20) DEFAULT NULL;

  SELECT COUNT(*), MAX(COLUMN_NAME), MAX(REFERENCED_TABLE_NAME), MAX(REFERENCED_TABLE_SCHEMA), MAX(REFERENCED_COLUMN_NAME)
    INTO v_n, v_col, v_rtable, v_rschema, v_rcol
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name;

  IF v_n = 0 THEN
    CALL _vp_exec(CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` FOREIGN KEY (`', p_col,
      '`) REFERENCES `', p_ref_table, '` (`', p_ref_col, '`) ON DELETE RESTRICT ON UPDATE RESTRICT'));
  ELSE
    SELECT MAX(DELETE_RULE), MAX(UPDATE_RULE) INTO v_del, v_upd
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name;
    IF v_n <> 1 OR v_col <> p_col OR v_rtable <> p_ref_table OR v_rschema <> DATABASE() OR v_rcol <> p_ref_col
       OR v_del NOT IN ('RESTRICT', 'NO ACTION') OR v_upd NOT IN ('RESTRICT', 'NO ACTION') THEN
      CALL _vp_abort(CONCAT('Clave foranea incompatible ', p_table, '.', p_name, ': existe sobre ', v_col, ' -> ',
        v_rtable, '(', v_rcol, ') ON DELETE ', v_del, ' ON UPDATE ', v_upd, ' y se esperaba ', p_col, ' -> ',
        p_ref_table, '(', p_ref_col, ') RESTRICT/RESTRICT. No se modifica automáticamente.'));
    END IF;
  END IF;
END$$

-- CHECK: verifica existencia o compatibilidad canónica estricta sin alterar paréntesis ni lógica booleana.
DROP PROCEDURE IF EXISTS _vp_ensure_check$$
CREATE PROCEDURE _vp_ensure_check(
  IN p_table VARCHAR(64),
  IN p_name VARCHAR(64),
  IN p_expr TEXT,
  IN p_canonical TEXT
)
BEGIN
  DECLARE v_actual TEXT DEFAULT NULL;
  DECLARE v_clean_actual TEXT DEFAULT NULL;
  DECLARE v_clean_canonical TEXT DEFAULT NULL;

  SELECT cc.CHECK_CLAUSE INTO v_actual
  FROM information_schema.CHECK_CONSTRAINTS cc
  JOIN information_schema.TABLE_CONSTRAINTS tc
    ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
  WHERE cc.CONSTRAINT_SCHEMA = DATABASE() AND cc.CONSTRAINT_NAME = p_name
    AND tc.TABLE_NAME = p_table AND tc.CONSTRAINT_TYPE = 'CHECK';

  IF v_actual IS NULL THEN
    CALL _vp_exec(CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` CHECK (', p_expr, ')'));
  ELSE
    SET v_clean_actual = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(v_actual, '`', ''), '_utf8mb4', ''), '\\', ''), '  ', ' ')));
    SET v_clean_canonical = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(p_canonical, '`', ''), '_utf8mb4', ''), '\\', ''), '  ', ' ')));

    IF v_clean_actual <> v_clean_canonical AND v_clean_actual <> LOWER(TRIM(p_expr)) THEN
      CALL _vp_abort(CONCAT('CHECK incompatible en ', p_table, '.', p_name, ': definicion actual [', v_actual,
        '] difiere de la esperada [', p_canonical, ']. Abortando para no alterar la lógica booleana.'));
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- Procedimiento Principal de Migración
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _vp_migrate$$
CREATE PROCEDURE _vp_migrate()
BEGIN
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_n BIGINT DEFAULT 0;
  DECLARE v_num INT DEFAULT 0;
  DECLARE v_ver VARCHAR(60);
  DECLARE v_engine VARCHAR(64) DEFAULT NULL;
  DECLARE v_existed INT DEFAULT 0;
  DECLARE v_col_type TEXT DEFAULT NULL;
  DECLARE v_col_null VARCHAR(3) DEFAULT NULL;
  DECLARE v_col_def TEXT DEFAULT NULL;
  DECLARE v_total_cols INT DEFAULT 0;
  DECLARE v_has_order_promo INT DEFAULT 0;
  DECLARE v_backfilled_subtotal BIGINT DEFAULT 0;
  DECLARE v_backfilled_redemptions BIGINT DEFAULT 0;
  DECLARE v_pending BIGINT DEFAULT 0;

  -- Manejador de excepciones: revierte transacción activa, libera lock y registra error
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DO RELEASE_LOCK('venti_migracion_promociones');
    SET @vp_migration_error = COALESCE(@vp_last_err, 'Error no especificado durante la migracion');
    SET @vp_failed_step = @venti_promo_step;
  END;

  -- ===== 0. Bloqueo de ejecución única ======================================
  SET @venti_promo_step = '0. Bloqueo de ejecución única';
  SELECT GET_LOCK('venti_migracion_promociones', 5) INTO v_lock;
  IF v_lock IS NULL OR v_lock <> 1 THEN
    CALL _vp_abort('Hay otra ejecución de esta migración en curso.');
  END IF;

  -- ===== 1. Comprobaciones previas de base y motor ==========================
  SET @venti_promo_step = '1. Comprobaciones previas de base y motor';
  IF DATABASE() IS NULL THEN
    CALL _vp_abort('No hay base de datos activa seleccionada. Ejecute USE <base> antes de correr esta migración.');
  END IF;

  SET v_ver = SUBSTRING_INDEX(VERSION(), '-', 1);
  SET v_num = CAST(SUBSTRING_INDEX(v_ver, '.', 1) AS UNSIGNED) * 10000
            + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(v_ver, '.', 2), '.', -1) AS UNSIGNED) * 100
            + CAST(SUBSTRING_INDEX(v_ver, '.', -1) AS UNSIGNED);
  IF VERSION() LIKE '%MariaDB%' OR v_num < 80016 THEN
    CALL _vp_abort(CONCAT('Se requiere MySQL >= 8.0.16 (soporte de CHECK aplicados). Versión actual: ', VERSION()));
  END IF;

  -- Verificar existencia del esquema base de Venti (orders, order_items, concerts, users) en InnoDB
  SELECT COUNT(*) INTO v_n FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE = 'InnoDB'
    AND TABLE_NAME IN ('orders', 'order_items', 'concerts', 'users');
  IF v_n <> 4 THEN
    CALL _vp_abort('Faltan orders / order_items / concerts / users o no son InnoDB: esta no es la base Venti esperada (el esquema real usa orders, no purchases).');
  END IF;

  -- Verificación exacta de columnas críticas en orders
  SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    INTO v_col_type, v_col_null, v_col_def
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status';

  IF v_col_type IS NULL OR LOWER(v_col_type) <> 'enum(''pending'',''confirmed'',''cancelled'',''expired'')' OR v_col_null <> 'NO' THEN
    CALL _vp_abort(CONCAT('Estructura incompatible en orders.status: existe como [', COALESCE(v_col_type, 'INEXISTENTE'),
      '] nullable=', COALESCE(v_col_null, 'NULL'), ' y se esperaba enum(\'PENDING\',\'CONFIRMED\',\'CANCELLED\',\'EXPIRED\') NOT NULL.'));
  END IF;

  SELECT COLUMN_TYPE, IS_NULLABLE
    INTO v_col_type, v_col_null
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'confirmed_at';

  IF v_col_type IS NULL OR LOWER(v_col_type) <> 'datetime' OR v_col_null <> 'YES' THEN
    CALL _vp_abort(CONCAT('Estructura incompatible en orders.confirmed_at: existe como [', COALESCE(v_col_type, 'INEXISTENTE'),
      '] nullable=', COALESCE(v_col_null, 'NULL'), ' y se esperaba datetime NULL.'));
  END IF;

  SELECT COLUMN_TYPE, IS_NULLABLE
    INTO v_col_type, v_col_null
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancelled_at';

  IF v_col_type IS NULL OR LOWER(v_col_type) <> 'datetime' OR v_col_null <> 'YES' THEN
    CALL _vp_abort(CONCAT('Estructura incompatible en orders.cancelled_at: existe como [', COALESCE(v_col_type, 'INEXISTENTE'),
      '] nullable=', COALESCE(v_col_null, 'NULL'), ' y se esperaba datetime NULL.'));
  END IF;

  -- Comprobar resto de columnas de orders, order_items, concerts, users
  SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND ((TABLE_NAME = 'orders' AND COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned' AND EXTRA LIKE '%auto_increment%')
      OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'user_id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'total_amount' AND COLUMN_TYPE = 'decimal(12,2)' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'currency' AND COLUMN_TYPE = 'char(3)' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'created_at' AND COLUMN_TYPE = 'datetime' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'updated_at' AND COLUMN_TYPE = 'datetime' AND IS_NULLABLE = 'NO' AND EXTRA LIKE '%on update CURRENT_TIMESTAMP%')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned' AND EXTRA LIKE '%auto_increment%')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'order_id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'concert_id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'quantity' AND COLUMN_TYPE = 'smallint unsigned' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'unit_price' AND COLUMN_TYPE = 'decimal(12,2)' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'order_items' AND COLUMN_NAME = 'line_total' AND COLUMN_TYPE = 'decimal(12,2)' AND IS_NULLABLE = 'NO')
      OR (TABLE_NAME = 'concerts' AND COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned' AND EXTRA LIKE '%auto_increment%')
      OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned' AND EXTRA LIKE '%auto_increment%'));
  IF v_n <> 14 THEN
    CALL _vp_abort(CONCAT('orders / order_items / concerts / users no tienen las columnas, tipos o atributos base esperados (encontradas ', v_n, ' de 14).'));
  END IF;

  -- Prechecks estructurales sobre promotions si ya existía antes de consultar datos
  SET @venti_promo_step = '1b. Prechecks estructurales de promotions preexistente';
  SELECT COUNT(*) INTO v_existed FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions';
  IF v_existed = 1 THEN
    SELECT ENGINE INTO v_engine FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions';
    IF v_engine <> 'InnoDB' THEN
      CALL _vp_abort(CONCAT('La tabla promotions preexistente usa motor ', COALESCE(v_engine, 'NULL'),
        '; se requiere InnoDB para garantizar claves foráneas e integridad transaccional.'));
    END IF;

    SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions'
      AND ((COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned')
        OR (COLUMN_NAME = 'code' AND COLUMN_TYPE LIKE 'varchar(%')
        OR (COLUMN_NAME = 'description')
        OR (COLUMN_NAME = 'discount_type' AND COLUMN_TYPE LIKE 'enum(%')
        OR (COLUMN_NAME = 'discount_value' AND COLUMN_TYPE = 'decimal(12,2)')
        OR (COLUMN_NAME = 'min_order_amount' AND COLUMN_TYPE = 'decimal(12,2)')
        OR (COLUMN_NAME = 'concert_id' AND COLUMN_TYPE = 'bigint unsigned')
        OR (COLUMN_NAME = 'max_uses' AND COLUMN_TYPE LIKE '%int%')
        OR (COLUMN_NAME = 'current_uses' AND COLUMN_TYPE LIKE '%int%')
        OR (COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE 'enum(%')
        OR (COLUMN_NAME = 'valid_from' AND COLUMN_TYPE = 'datetime')
        OR (COLUMN_NAME = 'valid_until' AND COLUMN_TYPE = 'datetime')
        OR (COLUMN_NAME = 'created_at' AND COLUMN_TYPE = 'datetime')
        OR (COLUMN_NAME = 'updated_at' AND COLUMN_TYPE = 'datetime'));
    IF v_n < 12 THEN
      CALL _vp_abort('La tabla promotions preexistente tiene columnas faltantes o incompatibles. Resolver manualmente antes de continuar.');
    END IF;

    SELECT COUNT(*) INTO v_n FROM promotions
    WHERE discount_value <= 0 OR min_order_amount < 0 OR valid_until <= valid_from
       OR (discount_type = 'PERCENTAGE' AND discount_value > 100)
       OR (max_uses IS NOT NULL AND (max_uses = 0 OR current_uses > max_uses))
       OR CHAR_LENGTH(code) < 3;
    IF v_n > 0 THEN
      CALL _vp_abort('promotions preexistente tiene filas que violan las reglas nuevas (importes <= 0, min_order < 0, vigencia inconsistente o usos excedidos). Corregirlas manualmente y re-ejecutar.');
    END IF;

    SELECT COUNT(*) INTO v_n FROM promotions p
    WHERE p.concert_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM concerts c WHERE c.id = p.concert_id);
    IF v_n > 0 THEN
      CALL _vp_abort('promotions preexistente tiene concert_id que no existen en concerts. Corregir integridad referencial antes de continuar.');
    END IF;
  END IF;

  -- Prechecks estructurales sobre promotion_redemptions si ya existía antes de consultar datos
  -- Se exige estrictamente que la tabla contenga exactamente sus 5 columnas esperadas sin columnas extra no soportadas.
  SET @venti_promo_step = '1c. Prechecks estructurales de promotion_redemptions preexistente';
  SELECT COUNT(*) INTO v_existed FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_redemptions';
  IF v_existed = 1 THEN
    SELECT ENGINE INTO v_engine FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_redemptions';
    IF v_engine <> 'InnoDB' THEN
      CALL _vp_abort(CONCAT('La tabla promotion_redemptions preexistente usa motor ', COALESCE(v_engine, 'NULL'),
        '; se requiere InnoDB.'));
    END IF;

    SELECT COUNT(*) INTO v_total_cols FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_redemptions';
    IF v_total_cols <> 5 THEN
      CALL _vp_abort(CONCAT('La tabla promotion_redemptions preexistente tiene ', v_total_cols,
        ' columnas. Se exigen exactamente 5 (id, promotion_id, order_id, consumed_at, released_at). No se permiten columnas adicionales.'));
    END IF;

    SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_redemptions'
      AND ((COLUMN_NAME = 'id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO' AND EXTRA LIKE '%auto_increment%')
        OR (COLUMN_NAME = 'promotion_id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO')
        OR (COLUMN_NAME = 'order_id' AND COLUMN_TYPE = 'bigint unsigned' AND IS_NULLABLE = 'NO')
        OR (COLUMN_NAME = 'consumed_at' AND COLUMN_TYPE = 'datetime' AND IS_NULLABLE = 'NO')
        OR (COLUMN_NAME = 'released_at' AND COLUMN_TYPE = 'datetime' AND IS_NULLABLE = 'YES'));
    IF v_n <> 5 THEN
      CALL _vp_abort('promotion_redemptions preexistente tiene columnas, tipos o nulabilidad incompatibles. Resolver manualmente.');
    END IF;

    SELECT COUNT(*) INTO v_n FROM promotion_redemptions
    WHERE released_at IS NOT NULL AND released_at < consumed_at;
    IF v_n > 0 THEN
      CALL _vp_abort('promotion_redemptions preexistente tiene filas con released_at < consumed_at. Corregir manualmente.');
    END IF;

    SELECT COUNT(*) INTO v_n FROM (
      SELECT order_id FROM promotion_redemptions GROUP BY order_id HAVING COUNT(*) > 1
    ) AS dup;
    IF v_n > 0 THEN
      CALL _vp_abort('promotion_redemptions preexistente tiene order_id duplicados, violando la unicidad por pedido. Resolver manualmente.');
    END IF;

    SELECT COUNT(*) INTO v_n FROM promotion_redemptions r
    WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id);
    IF v_n > 0 THEN
      CALL _vp_abort('promotion_redemptions preexistente tiene order_id huérfanos que no existen en orders.');
    END IF;

    IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions') = 1 THEN
      SELECT COUNT(*) INTO v_n FROM promotion_redemptions r
      WHERE NOT EXISTS (SELECT 1 FROM promotions p WHERE p.id = r.promotion_id);
      IF v_n > 0 THEN
        CALL _vp_abort('promotion_redemptions preexistente tiene promotion_id huérfanos que no existen en promotions.');
      END IF;
    END IF;

    -- Comprobar integridad con orders.promotion_id si orders ya poseía dicha columna
    SELECT COUNT(*) INTO v_has_order_promo
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'promotion_id';

    IF v_has_order_promo = 1 THEN
      SELECT COUNT(*) INTO v_n
      FROM promotion_redemptions r
      JOIN orders o ON o.id = r.order_id
      WHERE o.promotion_id IS NULL OR r.promotion_id <> o.promotion_id;
      IF v_n > 0 THEN
        CALL _vp_abort(CONCAT('Discrepancia de integridad: existen ', v_n, ' registros en promotion_redemptions cuyo promotion_id difiere del promotion_id de orders. Requiere resolución manual.'));
      END IF;
    END IF;
  END IF;

  -- ===== 2. Tabla promotions ===============================================
  SET @venti_promo_step = '2. Creación / reconciliación de tabla promotions';
  CREATE TABLE IF NOT EXISTS promotions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL,
    description VARCHAR(255) NOT NULL,
    discount_type ENUM('PERCENTAGE','FIXED') NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL,
    min_order_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    concert_id BIGINT UNSIGNED NULL,
    max_uses INT UNSIGNED NULL,
    current_uses INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('ACTIVE','INACTIVE','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    valid_from DATETIME NOT NULL,
    valid_until DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_promotions_code (code),
    KEY idx_promotions_concert (concert_id),
    KEY idx_promotions_status_validity (status, valid_from, valid_until),
    CONSTRAINT fk_promotions_concert FOREIGN KEY (concert_id) REFERENCES concerts (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_promotions_value CHECK (discount_value > 0),
    CONSTRAINT chk_promotions_percentage CHECK (discount_type = 'FIXED' OR discount_value <= 100),
    CONSTRAINT chk_promotions_min_order CHECK (min_order_amount >= 0),
    CONSTRAINT chk_promotions_validity CHECK (valid_until > valid_from),
    CONSTRAINT chk_promotions_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
    CONSTRAINT chk_promotions_uses CHECK (max_uses IS NULL OR current_uses <= max_uses),
    CONSTRAINT chk_promotions_code CHECK (CHAR_LENGTH(code) >= 3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  -- Reconciliación de estructura si la tabla ya existía
  SET @venti_promo_step = '2b. Verificar estructura de promotions';
  CALL _vp_ensure_column('promotions', 'id', NULL, 'bigint unsigned', 'NO', NULL, 'auto_increment');
  CALL _vp_ensure_column('promotions', 'code', NULL, 'varchar(50)', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'description', NULL, 'varchar(255)', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'discount_type', NULL, 'enum(''PERCENTAGE'',''FIXED'')', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'discount_value', NULL, 'decimal(12,2)', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'min_order_amount', NULL, 'decimal(12,2)', 'NO', '0.00', NULL);
  CALL _vp_ensure_column('promotions', 'concert_id', NULL, 'bigint unsigned', 'YES', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'max_uses', NULL, 'int unsigned', 'YES', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'current_uses', NULL, 'int unsigned', 'NO', '0', NULL);
  CALL _vp_ensure_column('promotions', 'status', NULL, 'enum(''ACTIVE'',''INACTIVE'',''EXPIRED'')', 'NO', 'ACTIVE', NULL);
  CALL _vp_ensure_column('promotions', 'valid_from', NULL, 'datetime', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'valid_until', NULL, 'datetime', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotions', 'created_at', NULL, 'datetime', 'NO', 'CURRENT_TIMESTAMP', NULL);
  CALL _vp_ensure_column('promotions', 'updated_at', NULL, 'datetime', 'NO', 'CURRENT_TIMESTAMP', 'on update CURRENT_TIMESTAMP');
  CALL _vp_ensure_index('promotions', 'uq_promotions_code', 'code', 1);
  CALL _vp_ensure_index('promotions', 'idx_promotions_concert', 'concert_id', 0);
  CALL _vp_ensure_index('promotions', 'idx_promotions_status_validity', 'status,valid_from,valid_until', 0);
  CALL _vp_ensure_fk('promotions', 'fk_promotions_concert', 'concert_id', 'concerts', 'id');
  CALL _vp_ensure_check('promotions', 'chk_promotions_value', 'discount_value > 0', '(`discount_value` > 0)');
  CALL _vp_ensure_check('promotions', 'chk_promotions_percentage', 'discount_type = ''FIXED'' OR discount_value <= 100', '((`discount_type` = _utf8mb4\'FIXED\') or (`discount_value` <= 100))');
  CALL _vp_ensure_check('promotions', 'chk_promotions_min_order', 'min_order_amount >= 0', '(`min_order_amount` >= 0)');
  CALL _vp_ensure_check('promotions', 'chk_promotions_validity', 'valid_until > valid_from', '(`valid_until` > `valid_from`)');
  CALL _vp_ensure_check('promotions', 'chk_promotions_max_uses', 'max_uses IS NULL OR max_uses > 0', '((`max_uses` is null) or (`max_uses` > 0))');
  CALL _vp_ensure_check('promotions', 'chk_promotions_uses', 'max_uses IS NULL OR current_uses <= max_uses', '((`max_uses` is null) or (`current_uses` <= `max_uses`))');
  CALL _vp_ensure_check('promotions', 'chk_promotions_code', 'CHAR_LENGTH(code) >= 3', '(char_length(`code`) >= 3)');

  -- ===== 3. Columnas nuevas en orders ========================================
  SET @venti_promo_step = '3. Columnas de promoción en orders';
  CALL _vp_ensure_column('orders', 'promotion_id', 'BIGINT UNSIGNED NULL', 'bigint unsigned', 'YES', NULL, NULL);
  CALL _vp_ensure_column('orders', 'promotion_code', 'VARCHAR(50) NULL', 'varchar(50)', 'YES', NULL, NULL);
  CALL _vp_ensure_column('orders', 'subtotal_amount', 'DECIMAL(12,2) NULL', 'decimal(12,2)', 'YES', NULL, NULL);
  CALL _vp_ensure_column('orders', 'discount_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00', 'decimal(12,2)', 'NO', '0.00', NULL);

  -- No permitir pedidos que referencien promociones inexistentes.
  SET @venti_promo_step = '3b. Integridad de orders.promotion_id';
  SELECT COUNT(*) INTO v_n
  FROM orders o
  WHERE o.promotion_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM promotions p WHERE p.id = o.promotion_id);
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' pedidos con promotion_id inexistente en promotions. Corregir antes de continuar.'));
  END IF;

  -- ===== 4. Tabla promotion_redemptions =====================================
  SET @venti_promo_step = '4. Tabla promotion_redemptions';
  CREATE TABLE IF NOT EXISTS promotion_redemptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    promotion_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    consumed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_promotion_redemptions_order (order_id),
    KEY idx_promotion_redemptions_promotion (promotion_id, released_at),
    CONSTRAINT fk_promotion_redemptions_promotion FOREIGN KEY (promotion_id) REFERENCES promotions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_promotion_redemptions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_promotion_redemptions_release CHECK (released_at IS NULL OR released_at >= consumed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  CALL _vp_ensure_column('promotion_redemptions', 'id', NULL, 'bigint unsigned', 'NO', NULL, 'auto_increment');
  CALL _vp_ensure_column('promotion_redemptions', 'promotion_id', NULL, 'bigint unsigned', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotion_redemptions', 'order_id', NULL, 'bigint unsigned', 'NO', NULL, NULL);
  CALL _vp_ensure_column('promotion_redemptions', 'consumed_at', NULL, 'datetime', 'NO', 'CURRENT_TIMESTAMP', NULL);
  CALL _vp_ensure_column('promotion_redemptions', 'released_at', NULL, 'datetime', 'YES', NULL, NULL);

  SELECT COUNT(*) INTO v_n
  FROM promotion_redemptions r
  WHERE NOT EXISTS (SELECT 1 FROM promotions p WHERE p.id = r.promotion_id);
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' redenciones con promotion_id inexistente. Corregir integridad antes de continuar.'));
  END IF;

  CALL _vp_ensure_index('promotion_redemptions', 'uq_promotion_redemptions_order', 'order_id', 1);
  CALL _vp_ensure_index('promotion_redemptions', 'idx_promotion_redemptions_promotion', 'promotion_id,released_at', 0);
  CALL _vp_ensure_fk('promotion_redemptions', 'fk_promotion_redemptions_promotion', 'promotion_id', 'promotions', 'id');
  CALL _vp_ensure_fk('promotion_redemptions', 'fk_promotion_redemptions_order', 'order_id', 'orders', 'id');
  CALL _vp_ensure_check('promotion_redemptions', 'chk_promotion_redemptions_release', 'released_at IS NULL OR released_at >= consumed_at', '((`released_at` is null) or (`released_at` >= `consumed_at`))');

  -- ===== 5. Backfill histórico conservador de subtotal_amount (transaccional)
  -- Evidencia matemática estricta: SUM(order_items.line_total) == total_amount y sin promoción previa.
  -- No modifica total_amount, ni estados, ni auditoría (o.updated_at = o.updated_at).
  SET @venti_promo_step = '5. Backfill de subtotal_amount con evidencia';
  START TRANSACTION;
  UPDATE orders o
  JOIN (SELECT order_id, SUM(line_total) AS items_total FROM order_items GROUP BY order_id) i ON i.order_id = o.id
  SET o.subtotal_amount = o.total_amount, o.updated_at = o.updated_at
  WHERE o.subtotal_amount IS NULL AND o.promotion_id IS NULL AND o.discount_amount = 0
    AND i.items_total = o.total_amount;
  SET v_backfilled_subtotal = ROW_COUNT();
  COMMIT;

  -- Comprobaciones de integridad antes de crear CHECKs en orders
  SELECT COUNT(*) INTO v_n FROM orders
  WHERE subtotal_amount IS NOT NULL AND (subtotal_amount - discount_amount) <> total_amount;
  IF v_n > 0 THEN
    CALL _vp_abort('Existen pedidos donde subtotal_amount - discount_amount <> total_amount. Resolver manualmente antes de crear los CHECKs.');
  END IF;

  SELECT COUNT(*) INTO v_n FROM orders
  WHERE discount_amount < 0 OR (subtotal_amount IS NOT NULL AND subtotal_amount < 0);
  IF v_n > 0 THEN
    CALL _vp_abort('Existen pedidos con subtotal o descuento negativo. Revisar manualmente antes de continuar.');
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM orders o
  LEFT JOIN promotions p ON p.id = o.promotion_id
  WHERE o.promotion_id IS NOT NULL
    AND (p.id IS NULL OR o.promotion_code IS NULL OR o.promotion_code <> p.code OR o.subtotal_amount IS NULL);
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' pedidos con promoción que no tienen snapshot coherente (promotion_id/promotion_code/subtotal_amount). Corregir manualmente antes de continuar.'));
  END IF;

  SELECT COUNT(*) INTO v_pending FROM orders WHERE subtotal_amount IS NULL;

  -- ===== 5b. Validaciones previas e inserción estricta de redenciones históricas
  -- REGLA 1: Abortar si existen órdenes CONFIRMED con confirmed_at NULL.
  -- No se asume created_at como confirmación ni se inventan datos históricos.
  SET @venti_promo_step = '5b. Validación de confirmed_at en órdenes confirmadas';
  SELECT COUNT(*) INTO v_n FROM orders
  WHERE status = 'CONFIRMED' AND promotion_id IS NOT NULL AND confirmed_at IS NULL;
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' órdenes CONFIRMED con promoción y confirmed_at NULL. No se puede asumir fecha de confirmación; corregir manualmente antes de migrar.'));
  END IF;

  SELECT COUNT(*) INTO v_n FROM orders
  WHERE promotion_id IS NOT NULL AND status = 'CANCELLED'
    AND confirmed_at IS NOT NULL AND cancelled_at IS NULL;
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' órdenes CANCELLED con promoción confirmada pero cancelled_at NULL. Corregir manualmente.'));
  END IF;

  SELECT COUNT(*) INTO v_n FROM orders
  WHERE promotion_id IS NOT NULL AND status = 'CANCELLED'
    AND confirmed_at IS NOT NULL AND cancelled_at < confirmed_at;
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' órdenes CANCELLED con cancelled_at anterior a confirmed_at. Corregir manualmente.'));
  END IF;

  -- REGLA 2: Abortar si promotion_redemptions tiene promoción distinta a orders
  SELECT COUNT(*) INTO v_n
  FROM promotion_redemptions r
  JOIN orders o ON o.id = r.order_id
  WHERE o.promotion_id IS NULL OR r.promotion_id <> o.promotion_id;
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Discrepancia de integridad: existen ', v_n, ' registros en promotion_redemptions cuyo promotion_id difiere del promotion_id de orders. Requiere resolución manual.'));
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM promotion_redemptions r
  JOIN orders o ON o.id = r.order_id
  WHERE (o.status = 'CONFIRMED' AND r.released_at IS NOT NULL)
     OR (o.status = 'CANCELLED' AND (o.confirmed_at IS NULL OR r.released_at IS NULL))
     OR (o.status IN ('PENDING', 'EXPIRED'));
  IF v_n > 0 THEN
    CALL _vp_abort(CONCAT('Existen ', v_n, ' redenciones cuyo estado no coincide con el estado del pedido. Revisar manualmente antes de continuar.'));
  END IF;

  -- Backfill seguro:
  -- - CONFIRMED con confirmed_at real -> consumed_at = confirmed_at, released_at = NULL.
  -- - CANCELLED con confirmed_at real y cancelled_at real -> consumed_at = confirmed_at, released_at = cancelled_at.
  -- - CANCELLED con confirmed_at NULL (cancelación de reserva pending) o PENDING/EXPIRED: no consumieron, no se registran.
  SET @venti_promo_step = '5c. Backfill de promotion_redemptions con evidencia';
  START TRANSACTION;
  INSERT INTO promotion_redemptions (promotion_id, order_id, consumed_at, released_at)
  SELECT o.promotion_id, o.id, o.confirmed_at, NULL
  FROM orders o
  WHERE o.promotion_id IS NOT NULL AND o.status = 'CONFIRMED' AND o.confirmed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM promotion_redemptions r WHERE r.order_id = o.id);
  SET v_backfilled_redemptions = ROW_COUNT();

  INSERT INTO promotion_redemptions (promotion_id, order_id, consumed_at, released_at)
  SELECT o.promotion_id, o.id, o.confirmed_at, o.cancelled_at
  FROM orders o
  WHERE o.promotion_id IS NOT NULL AND o.status = 'CANCELLED'
    AND o.confirmed_at IS NOT NULL AND o.cancelled_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM promotion_redemptions r WHERE r.order_id = o.id);
  COMMIT;

  -- Comprobación estricta del invariante: current_uses == redenciones activas
  SELECT COUNT(*) INTO v_n FROM promotions p
  WHERE p.current_uses <> (SELECT COUNT(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.released_at IS NULL);
  IF v_n > 0 THEN
    CALL _vp_abort('Invariante incumplido: promotions.current_uses difiere de las redenciones activas en promotion_redemptions. No se alteran contadores históricos arbitrariamente; requiere auditoría manual.');
  END IF;

  -- ===== 6. Índices, FK y CHECK en orders ===================================
  SET @venti_promo_step = '6. Índices, FK y CHECK en orders';
  CALL _vp_ensure_index('orders', 'idx_orders_promotion', 'promotion_id', 0);
  CALL _vp_ensure_fk('orders', 'fk_orders_promotion', 'promotion_id', 'promotions', 'id');
  CALL _vp_ensure_check('orders', 'chk_orders_discount', 'discount_amount >= 0', '(`discount_amount` >= 0)');
  CALL _vp_ensure_check('orders', 'chk_orders_subtotal', 'subtotal_amount IS NULL OR subtotal_amount >= 0', '((`subtotal_amount` is null) or (`subtotal_amount` >= 0))');
  CALL _vp_ensure_check('orders', 'chk_orders_amounts',
    'subtotal_amount IS NULL OR (subtotal_amount - discount_amount = total_amount)',
    '((`subtotal_amount` is null) or ((`subtotal_amount` - `discount_amount`) = `total_amount`))');
  CALL _vp_ensure_check('orders', 'chk_orders_promotion',
    '((promotion_id IS NULL AND promotion_code IS NULL AND discount_amount = 0) OR (promotion_id IS NOT NULL AND promotion_code IS NOT NULL AND subtotal_amount IS NOT NULL))',
    '(((`promotion_id` is null) and (`promotion_code` is null) and (`discount_amount` = 0)) or ((`promotion_id` is not null) and (`promotion_code` is not null) and (`subtotal_amount` is not null)))');

  -- ===== 7. Semillas: validación de existentes e inserción de faltantes =======
  -- Si no existen se insertan; si ya existen, se verifica estrictamente que sus atributos coincidan.
  -- Si difieren, ABORTA indicando código y atributo. No sobrescribe datos existentes automáticamente.
  SET @venti_promo_step = '7. Validación y siembra de promociones iniciales';
  IF @venti_promo_seeds = 1 THEN
    -- VENTI10
    SELECT COUNT(*) INTO v_existed FROM promotions WHERE code = 'VENTI10';
    IF v_existed = 1 THEN
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND discount_type <> 'PERCENTAGE') THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene discount_type inconsistente (se esperaba PERCENTAGE).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND discount_value <> 10.00) THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene discount_value inconsistente (se esperaba 10.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND min_order_amount <> 0.00) THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene min_order_amount inconsistente (se esperaba 0.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND max_uses IS NOT NULL) THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene max_uses inconsistente (se esperaba NULL).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND concert_id IS NOT NULL) THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene concert_id inconsistente (se esperaba NULL).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'VENTI10' AND (valid_from <> '2026-11-10 00:00:00' OR valid_until <> '2027-12-31 23:59:59')) THEN
        CALL _vp_abort('Semilla VENTI10 preexistente tiene vigencia (valid_from/valid_until) inconsistente.');
      END IF;
    ELSE
      INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
      VALUES ('VENTI10', '10% de descuento en tu compra de entradas', 'PERCENTAGE', 10.00, 0.00, NULL, NULL, 0, 'ACTIVE', '2026-11-10 00:00:00', '2027-12-31 23:59:59');
    END IF;

    -- PROMO20
    SELECT COUNT(*) INTO v_existed FROM promotions WHERE code = 'PROMO20';
    IF v_existed = 1 THEN
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND discount_type <> 'PERCENTAGE') THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene discount_type inconsistente (se esperaba PERCENTAGE).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND discount_value <> 20.00) THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene discount_value inconsistente (se esperaba 20.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND min_order_amount <> 5000.00) THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene min_order_amount inconsistente (se esperaba 5000.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND (max_uses IS NULL OR max_uses <> 500)) THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene max_uses inconsistente (se esperaba 500).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND concert_id IS NOT NULL) THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene concert_id inconsistente (se esperaba NULL).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'PROMO20' AND (valid_from <> '2026-11-10 00:00:00' OR valid_until <> '2027-12-31 23:59:59')) THEN
        CALL _vp_abort('Semilla PROMO20 preexistente tiene vigencia (valid_from/valid_until) inconsistente.');
      END IF;
    ELSE
      INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
      VALUES ('PROMO20', '20% de descuento en compras a partir de $5.000', 'PERCENTAGE', 20.00, 5000.00, NULL, 500, 0, 'ACTIVE', '2026-11-10 00:00:00', '2027-12-31 23:59:59');
    END IF;

    -- FIESTA1000
    SELECT COUNT(*) INTO v_existed FROM promotions WHERE code = 'FIESTA1000';
    IF v_existed = 1 THEN
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND discount_type <> 'FIXED') THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene discount_type inconsistente (se esperaba FIXED).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND discount_value <> 1000.00) THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene discount_value inconsistente (se esperaba 1000.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND min_order_amount <> 8000.00) THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene min_order_amount inconsistente (se esperaba 8000.00).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND (max_uses IS NULL OR max_uses <> 1000)) THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene max_uses inconsistente (se esperaba 1000).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND concert_id IS NOT NULL) THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene concert_id inconsistente (se esperaba NULL).');
      END IF;
      IF EXISTS (SELECT 1 FROM promotions WHERE code = 'FIESTA1000' AND (valid_from <> '2026-11-10 00:00:00' OR valid_until <> '2027-12-31 23:59:59')) THEN
        CALL _vp_abort('Semilla FIESTA1000 preexistente tiene vigencia (valid_from/valid_until) inconsistente.');
      END IF;
    ELSE
      INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, concert_id, max_uses, current_uses, status, valid_from, valid_until)
      VALUES ('FIESTA1000', '$1.000 de descuento fijo en compras a partir de $8.000', 'FIXED', 1000.00, 8000.00, NULL, 1000, 0, 'ACTIVE', '2026-11-10 00:00:00', '2027-12-31 23:59:59');
    END IF;
  END IF;

  -- ===== 8. Verificaciones posteriores exhaustivas ==========================
  SET @venti_promo_step = '8. Verificaciones posteriores';
  SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
    AND COLUMN_NAME IN ('promotion_id', 'promotion_code', 'subtotal_amount', 'discount_amount');
  IF v_n <> 4 THEN CALL _vp_abort('Faltan columnas nuevas en orders.'); END IF;

  SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions';
  IF v_n < 14 THEN CALL _vp_abort('Faltan columnas en promotions.'); END IF;

  SELECT COUNT(*) INTO v_n FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_redemptions';
  IF v_n <> 5 THEN CALL _vp_abort('promotion_redemptions debe contener exactamente 5 columnas.'); END IF;

  -- Verificación de CHECKs acotada a tabla y esquema exacto
  SELECT COUNT(*) INTO v_n FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
    AND ((TABLE_NAME = 'promotions' AND CONSTRAINT_NAME IN (
            'chk_promotions_value', 'chk_promotions_percentage', 'chk_promotions_min_order',
            'chk_promotions_validity', 'chk_promotions_max_uses', 'chk_promotions_uses', 'chk_promotions_code'))
      OR (TABLE_NAME = 'promotion_redemptions' AND CONSTRAINT_NAME IN (
            'chk_promotion_redemptions_release'))
      OR (TABLE_NAME = 'orders' AND CONSTRAINT_NAME IN (
            'chk_orders_discount', 'chk_orders_subtotal', 'chk_orders_amounts', 'chk_orders_promotion')));
  IF v_n <> 12 THEN CALL _vp_abort(CONCAT('Faltan CHECKs esperados: ', v_n, ' de 12 encontrados.')); END IF;

  -- Verificación de FKs acotada a tabla y esquema exacto
  SELECT COUNT(*) INTO v_n FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND ((TABLE_NAME = 'promotions' AND CONSTRAINT_NAME = 'fk_promotions_concert')
      OR (TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_promotion')
      OR (TABLE_NAME = 'promotion_redemptions' AND CONSTRAINT_NAME IN ('fk_promotion_redemptions_promotion', 'fk_promotion_redemptions_order')))
    AND DELETE_RULE IN ('RESTRICT', 'NO ACTION') AND UPDATE_RULE IN ('RESTRICT', 'NO ACTION');
  IF v_n <> 4 THEN CALL _vp_abort('Faltan claves foráneas o su regla no es RESTRICT.'); END IF;

  -- Verificación de índices acotada a tabla y esquema exacto
  SELECT COUNT(DISTINCT CONCAT(TABLE_NAME, '.', INDEX_NAME)) INTO v_n FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND ((TABLE_NAME = 'promotions' AND INDEX_NAME IN ('uq_promotions_code', 'idx_promotions_concert', 'idx_promotions_status_validity'))
      OR (TABLE_NAME = 'promotion_redemptions' AND INDEX_NAME IN ('uq_promotion_redemptions_order', 'idx_promotion_redemptions_promotion'))
      OR (TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_promotion'));
  IF v_n <> 6 THEN CALL _vp_abort('Faltan índices esperados.'); END IF;

  IF @venti_promo_seeds = 1 THEN
    SELECT COUNT(*) INTO v_n FROM promotions WHERE code IN ('VENTI10', 'PROMO20', 'FIESTA1000');
    IF v_n <> 3 THEN CALL _vp_abort('Faltan semillas de promociones.'); END IF;
  END IF;

  -- Comprobación final del invariante de redenciones
  SELECT COUNT(*) INTO v_n FROM promotions p
  WHERE p.current_uses <> (SELECT COUNT(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.released_at IS NULL);
  IF v_n > 0 THEN CALL _vp_abort('Invariante violado al finalizar: promotions.current_uses difiere de redenciones activas.'); END IF;

  DO RELEASE_LOCK('venti_migracion_promociones');
  SELECT 'MIGRACION DE PROMOCIONES COMPLETADA CON EXITO' AS estado,
         (SELECT COUNT(*) FROM orders) AS pedidos_total,
         v_backfilled_subtotal AS pedidos_con_subtotal_completado,
         v_backfilled_redemptions AS redenciones_historicas_registradas,
         v_pending AS pedidos_historicos_sin_evidencia_subtotal_null,
         (SELECT COUNT(*) FROM promotions) AS promociones_total;
END$$

CALL _vp_migrate()$$

DELIMITER ;

-- =====================================================================
-- 9. Limpieza de TODOS los procedimientos auxiliares tanto en éxito como en error
-- =====================================================================
DROP PROCEDURE IF EXISTS _vp_ensure_check;
DROP PROCEDURE IF EXISTS _vp_ensure_fk;
DROP PROCEDURE IF EXISTS _vp_ensure_index;
DROP PROCEDURE IF EXISTS _vp_ensure_column;
DROP PROCEDURE IF EXISTS _vp_exec;
DROP PROCEDURE IF EXISTS _vp_abort;
DROP PROCEDURE IF EXISTS _vp_migrate;

-- =====================================================================
-- 10. Diagnóstico y aborto formal si _vp_migrate detectó un fallo
-- =====================================================================
SET @vp_fail_stmt = IF(@vp_migration_error IS NOT NULL,
  'SELECT * FROM information_schema.__VENTI_MIGRATION_ABORT_20261110__',
  'DO 1'
);
PREPARE _vp_fail_exec FROM @vp_fail_stmt;
EXECUTE _vp_fail_exec;
DEALLOCATE PREPARE _vp_fail_exec;
