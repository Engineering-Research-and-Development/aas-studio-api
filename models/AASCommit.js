const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('AASCommit', {
    commit_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    document_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    commit_hash: {
      type: DataTypes.STRING(8),
      allowNull: false,
      comment: 'Short hex hash (git-style), generated from content + timestamp'
    },
    version: {
      type: DataTypes.STRING(16),
      allowNull: false,
      comment: 'Semantic version, e.g. 1.0.0'
    },
    revision: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'A',
      comment: 'Revision letter within the same version, e.g. A, B, C'
    },
    status: {
      type: DataTypes.ENUM('Draft', 'Active', 'Deprecated'),
      allowNull: false,
      defaultValue: 'Draft'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Commit message / summary of changes'
    },
    author_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: 'operator_id of the author'
    },
    parent_commit_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'Previous commit in the linear history; null for the initial commit'
    },
    snapshot_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'SHA-256 hash referencing AASSnapshot.hash (content-addressable)'
    }
  }, {
    sequelize,
    tableName: 'AASCommit',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'commit_id' }]
      },
      {
        name: 'aas_commit_document',
        using: 'BTREE',
        fields: [{ name: 'document_id' }]
      },
      {
        name: 'aas_commit_hash',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'commit_hash' }, { name: 'document_id' }]
      },
      {
        name: 'aas_commit_parent',
        using: 'BTREE',
        fields: [{ name: 'parent_commit_id' }]
      },
      {
        name: 'aas_commit_snapshot',
        using: 'BTREE',
        fields: [{ name: 'snapshot_hash' }]
      }
    ]
  });
};
