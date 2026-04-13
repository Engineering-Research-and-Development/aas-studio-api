const passport = require("passport");
const redisSessionService = require("../../services/redisSessionService");

const LocalStrategy = require("passport-local").Strategy;
const JWTStrategy = require("passport-jwt").Strategy;
const ExtractJWT = require("passport-jwt").ExtractJwt;

const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const config = require("../../config");

const models = require("../../models").models;
const UserModel = models.User

const jwtStrategy = new JWTStrategy(
    {
        jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken("Authorization"),
        secretOrKey: config.jwt.auth_secret,
    },
    async (token, callback) => {
        try {
            const user = await UserModel.findOne({
                include: [
                    {
                        model: models.Operator, as: "Operator",
                        include: [
                            {
                                model: models.Organization, as: "organization",
                                attributes: ["organization_id", "name", "email", "number", "picture", "is_activated"],
                                where: {
                                    organization_id: token.operator.organization_id
                                },
                                required: true
                            },
                        ],
                        required: true
                    }
                ],
                where: {
                    user_id: token.operator.user_id
                }
            });

            if (!user) {
                return callback(null, false);
            }

            // Verifica che la sessione esista ancora in Redis
            const sessionExists = await redisSessionService.getSession(
                token.operator.organization_id,
                token.operator.operator_id,
                token.operator.user_id,
                token.operator.session_id
            );

            if (!sessionExists) {
                return callback(null, false);
            }

            return callback(null, token.operator);
        } catch (error) {
            callback(error);
        }
    }
);

const loginStrategy = new LocalStrategy(
    {
        usernameField: "email",
        passwordField: "password",
    },
    async (email, password, callback) => {
        try {
            const user = await UserModel.findOne({
                include: [
                    {
                        model: models.Operator, as: "Operator",
                        include: [
                            {
                                model: models.Organization, as: "organization",
                                attributes: ["organization_id", "name", "email", "number", "picture", "is_activated"],
                                required: true
                            },
                        ],
                        required: true
                    }
                ],
                where: {
                    "email": { [Op.eq]: `${email}` }
                }
            });

            if (!user) {
                return callback(new Error("Credenziali errate"), null, null);
            }

            const isValid = await user.isValidPassword(password);

            if (!isValid) {
                return callback(new Error("Credenziali errate"), null, null);
            }

            if (user.is_activated != "activated") {
                return callback(new Error("Account non attivato"), null, null);
            }

            return callback(null, user, "Accesso eseguito con successo");
        } catch (error) {
            return callback(error);
        }
    }
);

module.exports = { jwtStrategy, loginStrategy };
