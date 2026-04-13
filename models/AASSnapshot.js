const Sequelize = require('sequelize');

/**
 * Content-addressable snapshot storage (analogous to git blob objects).
 *
 * Identical submodel content always produces the same SHA-256 hash, so two
 * commits pointing to the same state share a single row — no duplication.
 *
 * Hash is computed as:
 *   crypto.createHash('sha256')
 *     .update(JSON.stringify(content, Object.keys(content).sort()))
 *     .digest('hex')
 */
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('AASSnapshot', {
    hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
      comment: 'SHA-256 hex digest of the normalized JSON content'
    },
    content: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Full normalized JSON snapshot of the AAS submodel at this point'
    }
  }, {
    sequelize,
    tableName: 'AASSnapshot',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'hash' }]
      }
    ]
  });
};
