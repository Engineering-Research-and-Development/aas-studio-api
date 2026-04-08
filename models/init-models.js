var DataTypes = require("sequelize").DataTypes;
var _Operator = require("./Operator");
var _Organization = require("./Organization");
var _User = require("./User");

function initModels(sequelize) {
  var Operator = _Operator(sequelize, DataTypes);
  var Organization = _Organization(sequelize, DataTypes);
  var User = _User(sequelize, DataTypes);

  Operator.belongsTo(User, { as: "user", foreignKey: "user_id"});
  User.hasOne(Operator, { as: "Operator", foreignKey: "user_id"});
  Operator.belongsTo(Organization, { as: "organization", foreignKey: "organization_id"});
  Organization.hasMany(Operator, { as: "Operators", foreignKey: "organization_id"});

  return {
    Operator,
    Organization,
    User,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
