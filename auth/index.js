const passport = require("passport");
const fallbackStrategy = require("./strategies/fallbackStrategy");

passport.use("jwt", fallbackStrategy.jwtStrategy);
passport.use("login", fallbackStrategy.loginStrategy);

module.exports = passport;
