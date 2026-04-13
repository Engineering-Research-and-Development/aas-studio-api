const express = require('express');
const router = express.Router();

const unrestrictedRoutes = require("./unrestricted");
const restrictedRoutes = require("./restricted");

router.use(unrestrictedRoutes);

// Guard: operator and organization must be active
router.use((req, res, next) => {
    const is_activated = req.user.is_activated;
    const is_organization_activated = req.user.is_organization_activated;

    if (is_activated !== "activated") {
        return res.status(402).json({
            status: "Failure",
            message: "Il tuo account non è più attivo"
        });
    }

    if (is_organization_activated !== "activated") {
        return res.status(402).json({
            status: "Failure",
            message: "L'organizzazione non è più attiva"
        });
    }

    return next();
});

router.use(restrictedRoutes);

module.exports = router;
