module.exports = {
  stage: process.env.NODE_ENV || "development",
  port: process.env.PORT || 9010,
  database: {
    mariadb_host: process.env.MARIADB_HOST || "localhost",
    mariadb_port: process.env.MARIADB_PORT || "3306",
    mariadb_db: process.env.MARIADB_DB || "AASStudio",
    mariadb_user: process.env.MARIADB_USER || "root",
    mariadb_password: process.env.MARIADB_PASS || "SECRET_TOKEN",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  jwt: {
    auth_secret: process.env.JWT_AUTH_SECRET || "SECRET_TOKEN",
    refresh_secret: process.env.JWT_REFRESH_SECRET || "SECRET_TOKEN",
  }
};