-- ============================================================
--  AAS Studio — Riparazione collation
--
--  Risolve l'errore MariaDB 1267 "Illegal mix of collations"
--  (utf8mb4_uca1400_ai_ci vs utf8mb4_unicode_ci) che si verifica quando
--  alcune tabelle sono state create da schema/init.sql (utf8mb4_unicode_ci)
--  e altre dalla sync() di Sequelize con il default di MariaDB 11.4+
--  (utf8mb4_uca1400_ai_ci). Allinea TUTTE le tabelle a utf8mb4_unicode_ci.
--
--  Importa con:
--    mysql -u root -p AASStudio < schema/fix-collation.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `Organization`  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `User`          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Operator`      CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AASDocument`   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AASSnapshot`   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AASCommit`     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AASCommitDiff` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AASRef`        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ── Verifica (facoltativa): elenca eventuali colonne con collation diversa ──
-- SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND COLLATION_NAME IS NOT NULL
--   AND COLLATION_NAME <> 'utf8mb4_unicode_ci';
