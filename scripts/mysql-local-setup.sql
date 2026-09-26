-- One-time local MySQL 8 setup for GiftGenius development and the integration tests.
-- 1. Replace CHANGE_ME_LOCAL_PASSWORD below (twice) with a password of your choice.
-- 2. Run as root. PowerShell:
--      & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "source scripts/mysql-local-setup.sql"
--    bash / macOS / Linux:
--      mysql -u root -p < scripts/mysql-local-setup.sql
-- 3. Use the same password as DB_PASSWORD (app) and IT_DB_PASSWORD (integration tests).
CREATE DATABASE IF NOT EXISTS giftgenius      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS giftgenius_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'giftgenius'@'localhost' IDENTIFIED BY 'CHANGE_ME_LOCAL_PASSWORD';
ALTER USER 'giftgenius'@'localhost' IDENTIFIED BY 'CHANGE_ME_LOCAL_PASSWORD';
GRANT ALL PRIVILEGES ON giftgenius.*      TO 'giftgenius'@'localhost';
GRANT ALL PRIVILEGES ON giftgenius_test.* TO 'giftgenius'@'localhost';
FLUSH PRIVILEGES;

-- Check: should list giftgenius@localhost
SELECT user, host, plugin, account_locked FROM mysql.user WHERE user = 'giftgenius';
