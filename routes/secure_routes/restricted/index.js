const express = require('express');
const router = express.Router();

const session = require("./session");
const user = require("./user");

router.use("/session", session);

module.exports = router;
