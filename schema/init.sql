-- ============================================================
--  AAS Studio — Schema di inizializzazione + dati di test
--  MariaDB 10.4+
--
--  Credenziali di test:
--    email:    admin@aas-studio.local
--    password: password
--
--  Importa con:
--    mysql -u root -p AASStudio < schema/init.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ──────────────────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Organization` (
  `organization_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`            varchar(128)      NOT NULL,
  `email`           varchar(64)       NOT NULL,
  `vat_id`          varchar(32)       NOT NULL,
  `number`          text              NOT NULL,
  `picture`         text              DEFAULT NULL,
  `site`            text              DEFAULT NULL,
  `description`     text              DEFAULT NULL,
  `address`         text              NOT NULL,
  `zip`             text              NOT NULL,
  `city`            text              NOT NULL,
  `province`        text              NOT NULL,
  `state`           text              NOT NULL,
  `is_activated`    text              DEFAULT NULL,
  `created_at`      datetime          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      datetime          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`organization_id`),
  UNIQUE KEY `organization_unique` (`name`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `User` (
  `user_id`      int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         text             NOT NULL,
  `surname`      text             NOT NULL,
  `email`        varchar(64)      NOT NULL,
  `picture`      text             DEFAULT NULL,
  `password`     text             NOT NULL,
  `is_activated` text             DEFAULT NULL,
  `created_at`   datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `user_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Operator` (
  `operator_id`     int(10) UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`         int(10) UNSIGNED  NOT NULL,
  `organization_id` int(10) UNSIGNED  NOT NULL,
  `type`            tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `is_activated`    text              NOT NULL,
  `created_at`      datetime          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      datetime          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`operator_id`),
  KEY `operator_fk_1` (`user_id`),
  KEY `operator_fk_2` (`organization_id`),
  CONSTRAINT `op_user_fk` FOREIGN KEY (`user_id`)
    REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `op_org_fk`  FOREIGN KEY (`organization_id`)
    REFERENCES `Organization` (`organization_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `AASDocument` (
  `document_id`     int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_short`        varchar(128)     NOT NULL  COMMENT 'Human-readable name',
  `aas_id`          varchar(256)     NOT NULL  COMMENT 'ARI/URN identifier',
  `asset_id`        varchar(256)     NOT NULL  COMMENT 'URN asset identifier',
  `asset_kind`      enum('Instance','Type') NOT NULL DEFAULT 'Instance',
  `description`     text             DEFAULT NULL,
  `organization_id` int(10) UNSIGNED NOT NULL,
  `created_by`      int(10) UNSIGNED NOT NULL  COMMENT 'operator_id',
  `created_at`      datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `aas_document_unique` (`aas_id`, `organization_id`),
  KEY `aas_document_org` (`organization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- Content-addressable snapshot storage (git blob objects)

CREATE TABLE IF NOT EXISTS `AASSnapshot` (
  `hash`       varchar(64) NOT NULL COMMENT 'SHA-256 hex of normalised JSON',
  `content`    json        NOT NULL,
  `created_at` datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- Commit history (linked list via parent_commit_id)

CREATE TABLE IF NOT EXISTS `AASCommit` (
  `commit_id`        int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id`      int(10) UNSIGNED NOT NULL,
  `commit_hash`      varchar(8)       NOT NULL COMMENT 'Short hex hash (git-style)',
  `version`          varchar(16)      NOT NULL,
  `revision`         varchar(8)       NOT NULL DEFAULT 'A',
  `status`           enum('Draft','Active','Deprecated') NOT NULL DEFAULT 'Draft',
  `message`          text             NOT NULL,
  `author_id`        int(10) UNSIGNED NOT NULL COMMENT 'operator_id',
  `parent_commit_id` int(10) UNSIGNED DEFAULT NULL,
  `snapshot_hash`    varchar(64)      DEFAULT NULL,
  `created_at`       datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`commit_id`),
  UNIQUE KEY `aas_commit_hash` (`commit_hash`, `document_id`),
  KEY `aas_commit_document` (`document_id`),
  KEY `aas_commit_parent`   (`parent_commit_id`),
  KEY `aas_commit_snapshot` (`snapshot_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- Per-commit diff entries

CREATE TABLE IF NOT EXISTS `AASCommitDiff` (
  `diff_id`     int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `commit_id`   int(10) UNSIGNED NOT NULL,
  `change_type` enum('added','modified','removed') NOT NULL,
  `target`      varchar(64)      NOT NULL COMMENT 'e.g. Submodel, Property',
  `name`        varchar(256)     NOT NULL COMMENT 'element idShort',
  `description` text             DEFAULT NULL,
  `sort_order`  int(10) UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`diff_id`),
  KEY `aas_diff_commit` (`commit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- Named refs (HEAD, branches) — git refs equivalent

CREATE TABLE IF NOT EXISTS `AASRef` (
  `document_id` int(10) UNSIGNED NOT NULL,
  `ref_name`    varchar(64)      NOT NULL COMMENT 'HEAD, main, draft, release-x …',
  `commit_id`   int(10) UNSIGNED DEFAULT NULL,
  `created_at`  datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  datetime         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`, `ref_name`),
  KEY `aas_ref_commit` (`commit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA — dati di test
-- ============================================================

-- Organizzazione di test
INSERT INTO `Organization`
  (`organization_id`, `name`, `email`, `vat_id`, `number`, `address`, `zip`, `city`, `province`, `state`, `is_activated`)
VALUES
  (1, 'AAS Studio Demo', 'info@aas-studio.local', 'IT12345678901', '0000001',
   'Via Roma 1', '20100', 'Milano', 'MI', 'Italy', 'activated')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Utente admin di test  (password: "password", hash generato con bcrypt cost=10)
INSERT INTO `User`
  (`user_id`, `name`, `surname`, `email`, `password`, `is_activated`)
VALUES
  (1, 'Admin', 'Demo', 'admin@aas-studio.local',
   '$2b$10$ZP9MIp2473kSxLKXp8ylT.a5yvnSYMQclrGMA.t/jwuPBJsvvfoJO',
   'activated')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Operator: utente 1 → organizzazione 1, type=1 (admin)
INSERT INTO `Operator`
  (`operator_id`, `user_id`, `organization_id`, `type`, `is_activated`)
VALUES
  (1, 1, 1, 1, 'activated')
ON DUPLICATE KEY UPDATE `type` = VALUES(`type`);

-- ──────────────────────────────────────────────────────────
-- Documento AAS di test: Pompa centrifuga

INSERT INTO `AASDocument`
  (`document_id`, `id_short`, `aas_id`, `asset_id`, `asset_kind`, `description`, `organization_id`, `created_by`)
VALUES
  (1,
   'AAS_CentrifugalPump_CP200',
   'urn:aas-studio:demo:pump-cp200',
   'urn:asset:demo:centrifugal-pump-cp200',
   'Instance',
   'Pompa centrifuga CP200 — documento AAS di test',
   1, 1)
ON DUPLICATE KEY UPDATE `id_short` = VALUES(`id_short`);

-- Snapshot 1: stato iniziale
INSERT INTO `AASSnapshot` (`hash`, `content`) VALUES (
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  '{
    "submodels": [
      {
        "id": "sm-nameplate",
        "idShort": "Nameplate",
        "semanticId": "0173-1#01-AAF584#001",
        "description": "Nameplate del dispositivo",
        "category": "PARAMETER",
        "elements": [
          {"idShort": "ManufacturerName",  "type": "Property", "valueType": "xs:string", "value": "AAS Corp", "required": true},
          {"idShort": "ManufacturerProductDesignation", "type": "Property", "valueType": "xs:string", "value": "CP200", "required": true},
          {"idShort": "SerialNumber",  "type": "Property", "valueType": "xs:string", "value": "SN-00001", "required": false}
        ]
      }
    ]
  }'
) ON DUPLICATE KEY UPDATE `hash` = VALUES(`hash`);

-- Snapshot 2: stato aggiornato (aggiunto TechnicalData)
INSERT INTO `AASSnapshot` (`hash`, `content`) VALUES (
  'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
  '{
    "submodels": [
      {
        "id": "sm-nameplate",
        "idShort": "Nameplate",
        "semanticId": "0173-1#01-AAF584#001",
        "description": "Nameplate del dispositivo",
        "category": "PARAMETER",
        "elements": [
          {"idShort": "ManufacturerName",  "type": "Property", "valueType": "xs:string", "value": "AAS Corp", "required": true},
          {"idShort": "ManufacturerProductDesignation", "type": "Property", "valueType": "xs:string", "value": "CP200", "required": true},
          {"idShort": "SerialNumber",  "type": "Property", "valueType": "xs:string", "value": "SN-00001", "required": false}
        ]
      },
      {
        "id": "sm-technical",
        "idShort": "TechnicalData",
        "semanticId": "0173-1#01-AHF578#001",
        "description": "Dati tecnici della pompa",
        "category": "PARAMETER",
        "elements": [
          {"idShort": "MaxFlowRate",    "type": "Property", "valueType": "xs:double", "value": "120.5", "required": true},
          {"idShort": "MaxPressure",    "type": "Property", "valueType": "xs:double", "value": "10.0",  "required": true},
          {"idShort": "NominalPower",   "type": "Property", "valueType": "xs:double", "value": "7.5",   "required": true}
        ]
      }
    ]
  }'
) ON DUPLICATE KEY UPDATE `hash` = VALUES(`hash`);

-- Snapshot 3: versione Active (aggiunto Documentation)
INSERT INTO `AASSnapshot` (`hash`, `content`) VALUES (
  'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  '{
    "submodels": [
      {
        "id": "sm-nameplate",
        "idShort": "Nameplate",
        "semanticId": "0173-1#01-AAF584#001",
        "description": "Nameplate del dispositivo",
        "category": "PARAMETER",
        "elements": [
          {"idShort": "ManufacturerName",  "type": "Property", "valueType": "xs:string", "value": "AAS Corp", "required": true},
          {"idShort": "ManufacturerProductDesignation", "type": "Property", "valueType": "xs:string", "value": "CP200 Pro", "required": true},
          {"idShort": "SerialNumber",  "type": "Property", "valueType": "xs:string", "value": "SN-00001", "required": false}
        ]
      },
      {
        "id": "sm-technical",
        "idShort": "TechnicalData",
        "semanticId": "0173-1#01-AHF578#001",
        "description": "Dati tecnici della pompa",
        "category": "PARAMETER",
        "elements": [
          {"idShort": "MaxFlowRate",    "type": "Property", "valueType": "xs:double", "value": "150.0", "required": true},
          {"idShort": "MaxPressure",    "type": "Property", "valueType": "xs:double", "value": "12.0",  "required": true},
          {"idShort": "NominalPower",   "type": "Property", "valueType": "xs:double", "value": "9.2",   "required": true}
        ]
      },
      {
        "id": "sm-documentation",
        "idShort": "Documentation",
        "semanticId": "0173-1#01-AHF579#001",
        "description": "Documentazione tecnica",
        "category": "DOCUMENT",
        "elements": [
          {"idShort": "DocumentTitle",   "type": "Property", "valueType": "xs:string", "value": "CP200 Pro Manual", "required": true},
          {"idShort": "DocumentVersion", "type": "Property", "valueType": "xs:string", "value": "v3.0",            "required": false}
        ]
      }
    ]
  }'
) ON DUPLICATE KEY UPDATE `hash` = VALUES(`hash`);

-- ──────────────────────────────────────────────────────────
-- Commit history (3 commit, catena lineare)

-- Commit 1: initial commit
INSERT INTO `AASCommit`
  (`commit_id`, `document_id`, `commit_hash`, `version`, `revision`, `status`, `message`, `author_id`, `parent_commit_id`, `snapshot_hash`)
VALUES
  (1, 1, 'a1b2c3d4', '1.0.0', 'A', 'Deprecated', 'Initial commit: Nameplate submodel', 1, NULL,
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
ON DUPLICATE KEY UPDATE `message` = VALUES(`message`);

-- Commit 2: aggiunto TechnicalData
INSERT INTO `AASCommit`
  (`commit_id`, `document_id`, `commit_hash`, `version`, `revision`, `status`, `message`, `author_id`, `parent_commit_id`, `snapshot_hash`)
VALUES
  (2, 1, 'b2c3d4e5', '1.0.1', 'A', 'Deprecated', 'Aggiunto submodel TechnicalData', 1, 1,
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3')
ON DUPLICATE KEY UPDATE `message` = VALUES(`message`);

-- Commit 3: versione Active con Documentation
INSERT INTO `AASCommit`
  (`commit_id`, `document_id`, `commit_hash`, `version`, `revision`, `status`, `message`, `author_id`, `parent_commit_id`, `snapshot_hash`)
VALUES
  (3, 1, 'c3d4e5f6', '1.0.2', 'A', 'Active', 'Rilascio v1.0.2: CP200 Pro con Documentation', 1, 2,
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
ON DUPLICATE KEY UPDATE `message` = VALUES(`message`);

-- ──────────────────────────────────────────────────────────
-- Diff entries per commit

-- Commit 1 diff
INSERT INTO `AASCommitDiff` (`commit_id`, `change_type`, `target`, `name`, `description`, `sort_order`) VALUES
  (1, 'added', 'Submodel',  'Nameplate',         'Aggiunto submodel Nameplate con attributi base', 0),
  (1, 'added', 'Property',  'ManufacturerName',  'Nome produttore',                                1),
  (1, 'added', 'Property',  'SerialNumber',      'Numero di serie del dispositivo',                2);

-- Commit 2 diff
INSERT INTO `AASCommitDiff` (`commit_id`, `change_type`, `target`, `name`, `description`, `sort_order`) VALUES
  (2, 'added',    'Submodel', 'TechnicalData', 'Aggiunto submodel con dati tecnici pompa', 0),
  (2, 'added',    'Property', 'MaxFlowRate',   'Portata massima in m³/h',                  1),
  (2, 'added',    'Property', 'MaxPressure',   'Pressione massima in bar',                 2),
  (2, 'added',    'Property', 'NominalPower',  'Potenza nominale in kW',                   3);

-- Commit 3 diff
INSERT INTO `AASCommitDiff` (`commit_id`, `change_type`, `target`, `name`, `description`, `sort_order`) VALUES
  (3, 'modified', 'Property', 'ManufacturerProductDesignation', 'Aggiornato da CP200 a CP200 Pro',     0),
  (3, 'modified', 'Property', 'MaxFlowRate',                    'Aumentata portata massima a 150 m³/h', 1),
  (3, 'modified', 'Property', 'MaxPressure',                    'Aumentata pressione massima a 12 bar', 2),
  (3, 'modified', 'Property', 'NominalPower',                   'Aggiornata potenza nominale a 9.2 kW', 3),
  (3, 'added',    'Submodel', 'Documentation',                  'Aggiunto submodel documentazione',     4);

-- ──────────────────────────────────────────────────────────
-- Refs: HEAD, main puntano al commit 3; draft punta al commit 2

INSERT INTO `AASRef` (`document_id`, `ref_name`, `commit_id`) VALUES
  (1, 'HEAD',  3),
  (1, 'main',  3),
  (1, 'draft', 2)
ON DUPLICATE KEY UPDATE `commit_id` = VALUES(`commit_id`);

-- ============================================================
-- Fine schema
-- ============================================================
