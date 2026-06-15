const express = require('express');
const router = express.Router();

const session = require("./session");
const aas = require("../unrestricted/aas");
const aasRemote = require("../unrestricted/aasRemote");

router.use("/session", session);
router.use("/aas", aas);
router.use("/aas-remote", aasRemote);

module.exports = router;
