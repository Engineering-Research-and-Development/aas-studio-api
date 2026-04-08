const express = require('express');
const router = express.Router();

const { check, validationResult } = require('express-validator');

const _user = require("../../../controllers/user")

router.post('/insert', [
    check('name').isAlpha('it-IT', { ignore: " " }).trim(),
    check('surname').isAlpha('it-IT', { ignore: " '’" }).trim(),
    check('number').isMobilePhone('it-IT', { strictMode: false }).trim(),
    check('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).trim()
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    } else {
        _user.insertOne(req, res)
    }
});

router.post('/update', [
    check('user_id').isInt().trim(),
    check('name').isAlpha('it-IT', { ignore: " " }).trim(),
    check('surname').isAlpha('it-IT', { ignore: " '’" }).trim(),
    check('number').isMobilePhone('it-IT', { strictMode: false }).trim(),
    check('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).trim()
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    } else {
        _user.updateOne(req, res)
    }
});

router.post('/notify', [
    check('user_id').isInt().trim()
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    } else {
        _user.notifyOne(req, res)
    }
});

router.post('/list', [
    check('surname').isAlpha('it-IT', { ignore: " '’" }).trim(),
], (req, res) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    } else {
        _user.listAll(req, res)
    }
});

module.exports = router;