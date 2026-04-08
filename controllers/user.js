const path = require("path");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const crypto = require('crypto')

const models = require("../models").models;

const loggerService = require("../services/loggerService");

async function getUserID(email) {
    try {
        return models.User.findOne({
            attributes: ["user_id", "email"],
            where: {
                "email": { [Op.eq]: `${email}` }
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "getUserID";
        const functionParams = [email];
        loggerService.printError(fileName, functionName, functionParams, err.message);
        throw new Error("Errore durante il recupero delle informazioni collegate al tuo account");
    }
}
async function tryResetPassword(user_id, token) {
    try {
        return models.User.update({ is_activated: token }, {
            where: {
                "user_id": { [Op.eq]: `${user_id}` }
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "tryResetPassword";
        const functionParams = [user_id, token];
        loggerService.printError(fileName, functionName, functionParams, err.message);
        throw new Error("Errore durante la verifica dei requisiti per l'attivazione del tuo account");
    }
}
exports.resetPassword = async (req, callback) => {
    try {
        const email = req.body.email;

        var userData = await getUserID(email);
        if (!userData) {
            throw new Error("Non risulta essere registrato alcun account con l'indirizzo email fornito");
        }
        var token = crypto.randomBytes(10).toString('hex').slice(0, 10);
        var updateData = await tryResetPassword(userData.user_id, token);
        userData.is_activated = token;
        callback(null, userData);
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "resetPassword";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        callback(err.message, null);
    }
}

async function tryRecoverPassword(email, token, password) {
    try {
        return models.User.update({ is_activated: "activated", password: password }, {
            where: {
                "email": { [Op.eq]: `${email}` },
                "is_activated": { [Op.eq]: `${token}` }
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "email";
        const functionParams = [user_id, token, password];
        loggerService.printError(fileName, functionName, functionParams, err.message);
        throw new Error("Errore durante la procedura di recupero del tuo account");
    }
}
exports.recoverPassword = async (req, res) => {
    try {
        const email = req.body.email;
        const password = req.body.password;
        const token = req.body.token;

        var updateData = await tryRecoverPassword(email, token, password);
        if (!updateData[0]) {
            throw new Error("Il token di attivazione non sembra essere valido");
        }
        res.status(200).json({
            status: "Success",
            message: "Il tuo account è stato recuperato con successo"
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "recoverPassword";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        res.status(400).json({
            status: "Failure",
            message: err.message
        });
    }
};
