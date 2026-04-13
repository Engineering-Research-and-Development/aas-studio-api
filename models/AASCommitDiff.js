const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('AASCommitDiff', {
    diff_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    commit_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    change_type: {
      type: DataTypes.ENUM('added', 'modified', 'removed'),
      allowNull: false
    },
    target: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'Element category, e.g. Submodel, Property, Collection, Operation'
    },
    name: {
      type: DataTypes.STRING(256),
      allowNull: false,
      comment: 'Element identifier / idShort of the changed element'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable explanation of what changed and why'
    },
    sort_order: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: 'Display ordering within the commit diff'
    }
  }, {
    sequelize,
    tableName: 'AASCommitDiff',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'diff_id' }]
      },
      {
        name: 'aas_diff_commit',
        using: 'BTREE',
        fields: [{ name: 'commit_id' }]
      }
    ]
  });
};
