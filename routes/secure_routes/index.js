const express = require('express');
const router = express.Router();
const moment = require('moment');

const unrestrictedRoutes = require("./unrestricted");
const restrictedRoutes = require("./restricted");

router.use(unrestrictedRoutes);

router.use((req, res, next) => {
    const is_activated = req.user.is_activated;
    const is_organization_activated = req.user.is_organization_activated;
  
    if (!is_activated == "activated") {
        return res.status(402).json({
            status: "Failure",
            message: "Operator is no longer active"
        });
    }
    if (!is_organization_activated == "activated") {
        return res.status(402).json({
            status: "Failure",
            message: "Organization is no longer active"
        });
    }
    if (moment().isAfter(expirationLimit)) {
        return res.status(402).json({
            status: "Failure",
            message: "Subscription has expired. Please contact support."
        });
    }

    return next();
});

router.use(restrictedRoutes);

module.exports = router;
