const Sequelize = require("sequelize");
const config = require("../config");

const sequelize = new Sequelize(config.database.mariadb_db, config.database.mariadb_user, config.database.mariadb_password, {
  host: config.database.mariadb_host,
  port: config.database.mariadb_port,
  dialect: "mariadb",
  pool: {
    max: 10,
    min: 0,
    acquire: 60000,
    idle: 10000,
    evict: 5000,
    // scarta connessioni zombi rimaste aperte dopo failover Galera
    validate: (connection) => connection && connection.isValid()
  },
  dialectOptions: {
    connectTimeout: 30000,
    acquireTimeout: 30000,
    // se il nodo si blocca durante una query, non aspettare in eterno
    socketTimeout: 60000,
    timeout: 60000,
    multipleStatements: false
  },
  retry: {
    max: 5,
    // backoff esponenziale: 300ms → 450ms → 675ms → ~1s → ~1.5s
    backoffBase: 300,
    backoffExponent: 1.5,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /ETIMEDOUT/,
      /EHOSTUNREACH/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      // Galera-specific
      /WSREP has not yet prepared/,
      /wsrep/i,
      /ER_LOCK_DEADLOCK/,
      /deadlock/i,
      /1213/,
      /ER_LOCK_WAIT_TIMEOUT/,
      /Lock wait timeout exceeded/i,
      /1205/,
      /certification failed/i,
      /BF abort/i,
      /brute force/i
    ]
  },
  define: {
    freezeTableName: true,
    underscored: true
  },
  logging: config.stage === 'development' ? console.log : false
});

var initModels = require("./init-models");
var models = initModels(sequelize);

var dbConnection = {}
dbConnection.sequelize = sequelize;

module.exports.dbConnection = dbConnection;
module.exports.models = models;