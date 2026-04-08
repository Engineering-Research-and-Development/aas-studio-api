const express = require("express");
const router = express.Router();

const _session = require("../../../controllers/session");

router.get("/logout", (req, res) => {
    _session.logout(req, res);
});

module.exports = router;
