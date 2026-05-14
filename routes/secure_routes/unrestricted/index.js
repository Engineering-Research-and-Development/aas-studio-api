const express = require("express");
const router = express.Router();

const session = require("./session");
const idtaCatalog = require("../../../controllers/idtaCatalog");

router.use("/session", session);

router.get("/idta/catalog", idtaCatalog.getCatalog);
router.delete("/idta/catalog/cache", idtaCatalog.invalidateCache);

module.exports = router;
