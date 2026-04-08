const express = require("express");
const router = express.Router();

const session = require("./session");

router.use("/session", session);

module.exports = router;
