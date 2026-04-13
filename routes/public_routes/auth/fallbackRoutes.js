const express = require("express");
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const passport = require("passport");
const jwt = require("jsonwebtoken");

const config = require("../../../config");

const models = require("../../../models").models;
const UserModel = models.User;
const redisSessionService = require("../../../services/redisSessionService");

router.post('/login', [
    check('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).trim(),
    check('password').isAlphanumeric('it-IT', { ignore: "_?!@#$%^&" }).trim()
], (req, res, next) => {
    var err = validationResult(req);
    if (!err.isEmpty()) {
        res.status(422).json({
            status: "Failure",
            message: "Errore durante la validazione dell'input"
        });
    } else {
        passport.authenticate('login', async (err, user, info) => {
            try {
                if (err || !user) {
                    if (err.message == "Credenziali errate") {
                        return res.status(403).json({
                            status: "Failure",
                            message: "Username o password errati"
                        });
                    } else if (err.message == "Account non attivato") {
                        return res.status(403).json({
                            status: "Failure",
                            message: "La tua utenza non è più attiva"
                        });
                    } else {
                        return res.status(403).json({
                            status: "Failure",
                            message: err.message || "Errore di autenticazione"
                        });
                    }
                }

                req.login(user, { session: false }, async (error) => {
                    if (error) {
                        return res.status(403).json({
                            status: "Failure",
                            message: error
                        });
                    }

                    // Genera session_id univoco
                    const session_id = redisSessionService.generateSessionId();

                    const payload = {
                        user_id: user.user_id,
                        operator_id: user.Operator.operator_id,
                        organization_id: user.Operator.organization_id,
                        type: user.Operator.type,
                        is_activated: user.Operator.is_activated,
                        is_organization_activated: user.Operator.organization.is_activated,
                        session_id: session_id
                    };

                    const accessToken = jwt.sign({ operator: payload },
                        config.jwt.auth_secret,
                        { expiresIn: '15m' }
                    );

                    const refreshToken = jwt.sign({ operator: payload },
                        config.jwt.refresh_secret,
                        { expiresIn: "7d" }
                    );

                    // Salva la sessione in Redis invece del database
                    await redisSessionService.createSession(
                        payload.organization_id,
                        payload.operator_id,
                        payload.user_id,
                        session_id,
                        refreshToken,
                        {
                            device: req.headers['user-agent'],
                            ip_address: req.ip || req.connection.remoteAddress
                        }
                    );

                    return res.status(200).json({
                        status: "Success",
                        message: info,
                        data: {
                            operator_id: payload.operator_id,
                            user_id: payload.user_id,
                            organization_id: payload.organization_id,
                            session_id: session_id,
                            auth_token: accessToken,
                            name: user.name,
                            surname: user.surname,
                            email: user.email,
                            picture: user.picture || null,
                            user: {
                                user_id: user.user_id,
                                name: user.name,
                                surname: user.surname,
                                email: user.email,
                                picture: user.picture,
                            },
                            organization: {
                                organization_id: user.Operator.organization.organization_id,
                                name: user.Operator.organization.name,
                                email: user.Operator.organization.email,
                                picture: user.Operator.organization.picture
                            }
                        }
                    });
                });
            } catch (error) {
                return res.status(500).json({
                    status: "Failure",
                    message: info
                });
            }
        })(req, res, next);
    }
});

router.get("/refresh", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(422).json({
                status: "Failure",
                message: "Authorization header missing or malformed"
            });
        }
        const accessToken = authHeader.split(' ')[1];
        if (!accessToken || !/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+$/.test(accessToken)) {
            return res.status(422).json({
                status: "Failure",
                message: "Invalid access token format"
            });
        }
        const decodedExpiredToken = jwt.decode(accessToken, config.jwt.auth_secret);

        // Verifica che session_id sia presente nel token
        if (!decodedExpiredToken.operator.session_id) {
            return res.status(403).json({
                status: "Failure",
                message: "Invalid session_id"
            });
        }

        const user = await UserModel.findOne({
            include: [
                {
                    model: models.Operator, as: "Operator",
                    include: [
                        {
                            model: models.Organization, as: "organization",
                            attributes: ["organization_id", "name", "email", "number", "picture", "is_activated"],
                            where: {
                                "organization_id": { [Op.eq]: `${decodedExpiredToken.operator.organization_id}` }
                            },
                            required: true
                        },
                    ],
                    required: true
                }
            ],
            where: {
                "user_id": { [Op.eq]: `${decodedExpiredToken.operator.user_id}` }
            }
        });

        if (!user) {
            return res.status(403).json({
                status: "Failure",
                message: "User not found"
            });
        }

        // Verifica la sessione in Redis
        const sessionData = await redisSessionService.getSession(
            decodedExpiredToken.operator.organization_id,
            decodedExpiredToken.operator.operator_id,
            decodedExpiredToken.operator.user_id,
            decodedExpiredToken.operator.session_id
        );

        if (!sessionData) {
            return res.status(403).json({
                status: "Failure",
                message: "Session expired or invalidated"
            });
        }

        // Verifica il refresh token salvato in Redis
        const isValidRefreshToken = jwt.verify(sessionData.refresh_token, config.jwt.refresh_secret);

        if (!isValidRefreshToken || !isValidRefreshToken.operator) {
            return res.status(403).json({
                status: "Failure",
                message: "Invalid refresh token"
            });
        }

        const payload = {
            operator_id: isValidRefreshToken.operator.operator_id,
            organization_id: isValidRefreshToken.operator.organization_id,
            user_id: isValidRefreshToken.operator.user_id,
            type: user.Operator.type,
            is_activated: user.Operator.is_activated,
            is_organization_activated: user.Operator.organization.is_activated,
            expiration: user.Operator.organization.expiration,
            session_id: decodedExpiredToken.operator.session_id // Mantieni lo stesso session_id
        };

        const newAccessToken = jwt.sign({ operator: payload },
            config.jwt.auth_secret,
            { expiresIn: "15m" }
        );

        const newRefreshToken = jwt.sign({ operator: payload },
            config.jwt.refresh_secret,
            { expiresIn: "7d" }
        );

        // Aggiorna la sessione in Redis
        await redisSessionService.updateSession(
            payload.organization_id,
            payload.operator_id,
            payload.user_id,
            payload.session_id,
            newRefreshToken
        );

        return res.status(200).json({
            status: "Success",
            message: "Token refreshed successfully",
            data: {
                auth_token: newAccessToken
            }
        });
    } catch (error) {
        return res.status(403).json({
            status: "Failure",
            message: "Invalid or expired refresh token"
        });
    }
});

module.exports = router;
