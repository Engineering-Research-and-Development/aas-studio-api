const express = require("express");
const router = express.Router();

const fallbackRoutes = require("./fallbackRoutes");

router.use(fallbackRoutes);

module.exports = router;
