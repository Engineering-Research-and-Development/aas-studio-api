const express = require('express');
const router = express.Router();
const passport = require('passport');

const auth = require("../auth");

const publicRoutes = require("./public_routes");
const secureRoutes = require("./secure_routes");

router.get("/healthz", (req, res) => {
    res.status(200).json({ status: "Success" });
});

router.use(publicRoutes);

function passport_authenticate_jwt(req, res, next) {
    passport.authenticate("jwt", function (err, user, info) {
        if (err) return next(err);
        if (!user){
            let message = "La tua sessione non è più valida, per favore rieffettua l'accesso";
            if (info && typeof info === "object") {
                if (info.name === "TokenExpiredError") {
                    message = "Il tuo token è scaduto, rieffettua l'accesso";
                } else if (info.name === "JsonWebTokenError") {
                    message = "Token non valido, rieffettua l'accesso";
                } else if (info.message) {
                    message = info.message;
                }
            }
            return res.status(401).send({
                status: "failure",
                message: message
            });
        }
        req.user = user;
        next();
    })(req, res, next);
}

router.use(passport_authenticate_jwt, secureRoutes);
module.exports = router;
