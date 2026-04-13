const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('AASDocument', {
    document_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    id_short: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: 'Human-readable identifier, e.g. AAS_CentrifugalPump_CP200'
    },
    aas_id: {
      type: DataTypes.STRING(256),
      allowNull: false,
      comment: 'ARI/URN identifier of the AAS, e.g. urn:org:aas-pump-001'
    },
    asset_id: {
      type: DataTypes.STRING(256),
      allowNull: false,
      comment: 'URN-formatted asset identifier'
    },
    asset_kind: {
      type: DataTypes.ENUM('Instance', 'Type'),
      allowNull: false,
      defaultValue: 'Instance'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    organization_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: 'operator_id of the creator'
    }
  }, {
    sequelize,
    tableName: 'AASDocument',
    timestamps: true,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'document_id' }]
      },
      {
        name: 'aas_document_org',
        using: 'BTREE',
        fields: [{ name: 'organization_id' }]
      },
      {
        name: 'aas_document_unique',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'aas_id' }, { name: 'organization_id' }]
      }
    ]
  });
};
