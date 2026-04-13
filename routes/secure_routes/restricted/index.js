const express = require('express');
const router = express.Router();

const session = require("./session");
const aas = require("../unrestricted/aas");

router.use("/session", session);
router.use("/aas", aas);

module.exports = router;
