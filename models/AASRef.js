const Sequelize = require('sequelize');

/**
 * Named ref pointers — analogous to git refs (HEAD, branches, tags).
 *
 * Each row is a (document_id, ref_name) pair pointing to a commit.
 *
 * Reserved ref names:
 *   'HEAD'        — the currently active commit for the document
 *   'main'        — the main production branch
 *   'draft'       — work-in-progress branch
 *   'production'  — locked production snapshot
 *
 * Arbitrary names are allowed (e.g., 'release-2.0', 'hotfix').
 */
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('AASRef', {
    document_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    ref_name: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
      comment: "Ref name, e.g. 'HEAD', 'main', 'draft', 'production'"
    },
    commit_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'Commit this ref points to; null means unborn ref'
    }
  }, {
    sequelize,
    tableName: 'AASRef',
    timestamps: true,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'document_id' }, { name: 'ref_name' }]
      },
      {
        name: 'aas_ref_commit',
        using: 'BTREE',
        fields: [{ name: 'commit_id' }]
      }
    ]
  });
};
