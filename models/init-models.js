var DataTypes = require("sequelize").DataTypes;
var _Operator = require("./Operator");
var _Organization = require("./Organization");
var _User = require("./User");
var _AASDocument = require("./AASDocument");
var _AASSnapshot = require("./AASSnapshot");
var _AASCommit = require("./AASCommit");
var _AASCommitDiff = require("./AASCommitDiff");
var _AASRef = require("./AASRef");

function initModels(sequelize) {
  var Operator = _Operator(sequelize, DataTypes);
  var Organization = _Organization(sequelize, DataTypes);
  var User = _User(sequelize, DataTypes);
  var AASDocument = _AASDocument(sequelize, DataTypes);
  var AASSnapshot = _AASSnapshot(sequelize, DataTypes);
  var AASCommit = _AASCommit(sequelize, DataTypes);
  var AASCommitDiff = _AASCommitDiff(sequelize, DataTypes);
  var AASRef = _AASRef(sequelize, DataTypes);

  // --- User / Operator / Organization ---
  Operator.belongsTo(User, { as: "user", foreignKey: "user_id"});
  User.hasOne(Operator, { as: "Operator", foreignKey: "user_id"});
  Operator.belongsTo(Organization, { as: "organization", foreignKey: "organization_id"});
  Organization.hasMany(Operator, { as: "Operators", foreignKey: "organization_id"});

  // --- AASDocument ---
  AASDocument.belongsTo(Organization, { as: "organization", foreignKey: "organization_id" });
  Organization.hasMany(AASDocument, { as: "AASDocuments", foreignKey: "organization_id" });

  AASDocument.belongsTo(Operator, { as: "creator", foreignKey: "created_by" });
  Operator.hasMany(AASDocument, { as: "AASDocuments", foreignKey: "created_by" });

  // --- AASSnapshot (content-addressable, no FK constraint needed — hash is the key) ---
  AASCommit.belongsTo(AASSnapshot, { as: "snapshot", foreignKey: "snapshot_hash", targetKey: "hash" });
  AASSnapshot.hasMany(AASCommit, { as: "commits", foreignKey: "snapshot_hash", sourceKey: "hash" });

  // --- AASCommit ---
  AASCommit.belongsTo(AASDocument, { as: "document", foreignKey: "document_id" });
  AASDocument.hasMany(AASCommit, { as: "commits", foreignKey: "document_id" });

  AASCommit.belongsTo(Operator, { as: "author", foreignKey: "author_id" });
  Operator.hasMany(AASCommit, { as: "AASCommits", foreignKey: "author_id" });

  // self-referential: linked list of history
  AASCommit.belongsTo(AASCommit, { as: "parent", foreignKey: "parent_commit_id" });
  AASCommit.hasOne(AASCommit, { as: "child", foreignKey: "parent_commit_id" });

  // --- AASCommitDiff ---
  AASCommitDiff.belongsTo(AASCommit, { as: "commit", foreignKey: "commit_id" });
  AASCommit.hasMany(AASCommitDiff, { as: "diffs", foreignKey: "commit_id" });

  // --- AASRef (named refs: HEAD, branches) ---
  AASRef.belongsTo(AASDocument, { as: "document", foreignKey: "document_id" });
  AASDocument.hasMany(AASRef, { as: "refs", foreignKey: "document_id" });

  AASRef.belongsTo(AASCommit, { as: "commit", foreignKey: "commit_id" });
  AASCommit.hasMany(AASRef, { as: "refs", foreignKey: "commit_id" });

  return {
    Operator,
    Organization,
    User,
    AASDocument,
    AASSnapshot,
    AASCommit,
    AASCommitDiff,
    AASRef,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
