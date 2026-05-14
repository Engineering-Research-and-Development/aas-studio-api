const path = require('path');
const idtaCatalogService = require('../services/idtaCatalogService');
const loggerService = require('../services/loggerService');

module.exports = {
  /**
   * GET /v1/idta/catalog
   * Restituisce l'array di path JSON dal repo IDTA, con cache Redis 24h.
   */
  getCatalog: async function (req, res) {
    try {
      const paths = await idtaCatalogService.getCatalogPaths();
      return res.status(200).json({ status: 'Success', data: paths });
    } catch (err) {
      loggerService.printError(path.basename(__filename), 'getCatalog', [], err.message);
      return res.status(502).json({ status: 'Failure', message: 'Impossibile recuperare il catalogo IDTA' });
    }
  },

  /**
   * DELETE /v1/idta/catalog/cache
   * Invalida la cache Redis (admin only).
   */
  invalidateCache: async function (req, res) {
    try {
      await idtaCatalogService.invalidateCache();
      return res.status(200).json({ status: 'Success', message: 'Cache IDTA invalidata' });
    } catch (err) {
      loggerService.printError(path.basename(__filename), 'invalidateCache', [], err.message);
      return res.status(500).json({ status: 'Failure', message: err.message });
    }
  },
};
