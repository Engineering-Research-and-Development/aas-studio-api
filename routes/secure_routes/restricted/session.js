const express = require("express");
const router = express.Router();
const { check, validationResult } = require('express-validator');

const _session = require("../../../controllers/session");

router.get("/list", (req, res) => {
    _session.listOrganizationSessions(req, res);
});

router.get("/logout", (req, res) => {
    _session.logout(req, res);
});

router.post("/disconnect/operator", [
    check('operator_id').isInt({ min: 1 })
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        return res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    }
    _session.disconnectOperator(req, res);
});

router.post("/disconnect/device", [
    check('operator_id').isInt({ min: 1 }),
    check('session_id').isAlphanumeric().isLength({ min: 16, max: 64 })
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        return res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    }
    _session.disconnectDevice(req, res);
});

module.exports = router;
