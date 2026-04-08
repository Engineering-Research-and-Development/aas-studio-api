const path = require("path");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const models = require("../models").models;
const loggerService = require("../services/loggerService");
const redisSessionService = require("../services/redisSessionService");

async function getOperatorInfo(operator_id) {
    try {
        return models.Operator.findOne({
            attributes: ['operator_id', 'user_id', 'type'],
            include: [
                {
                    model: models.User, as: 'user',
                    attributes: ['user_id', 'name', 'surname', 'email'],
                    required: true
                }
            ],
            where: {
                operator_id: { [Op.eq]: `${operator_id}` }
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "getOperatorInfo";
        const functionParams = [operator_id];
        loggerService.printError(fileName, functionName, functionParams, err.message);
        throw new Error("Errore durante il recupero delle informazioni dell'operator");
    }
}

async function verifyOperatorBelongsToOrganization(operator_id, organization_id) {
    try {
        return models.Operator.findOne({
            where: {
                operator_id: { [Op.eq]: `${operator_id}` },
                organization_id: { [Op.eq]: `${organization_id}` }
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "verifyOperatorBelongsToOrganization";
        const functionParams = [operator_id, organization_id];
        loggerService.printError(fileName, functionName, functionParams, err.message);
        throw new Error("Errore durante la verifica dell'appartenenza dell'operator alla organization");
    }
}

exports.listOrganizationSessions = async (req, res) => {
    try {
        const organization_id = req.user.organization_id;
        const operator_id = req.user.operator_id;
        const user_id = req.user.user_id;
        const type = req.user.type;

        var sessions = [];

        if (type == 'admin') {
            sessions = await redisSessionService.getOrganizationSessions(organization_id);
            // Arricchisci i dati con informazioni sugli operator
            const enrichedSessions = await Promise.all(sessions.map(async (session) => {
                const operator = await getOperatorInfo(session.operator_id);

                return {
                    ...session,
                    operator: {
                        operator_id: operator ? operator.operator_id : null,
                        user_id: operator ? operator.user_id : null,
                        type: operator ? operator.type : null,
                        user: {
                            user_id: operator ? operator.user_id : null,
                            name: operator ? operator.user.name : 'Unknown',
                            surname: operator ? operator.user.surname : 'Unknown',
                            email: operator ? operator.user.email : 'Unknown'
                        }
                    }
                };
            }));

            return res.status(200).json({
                status: "Success",
                message: "Sessioni recuperate con successo",
                data: {
                    total: enrichedSessions.length,
                    sessions: enrichedSessions
                }
            });
        }else{
            sessions = await redisSessionService.getOperatorSessions(organization_id, operator_id, user_id);

            return res.status(200).json({
                status: "Success",
                message: "Sessioni recuperate con successo",
                data: {
                    total: sessions.length,
                    sessions: sessions
                }
            });
        }

    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "listOrganizationSessions";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        return res.status(500).json({
            status: "Failure",
            message: err.message
        });
    }
};

exports.disconnectOperator = async (req, res) => {
    try {
        const organization_id = req.user.organization_id;
        const requester_operator_id = req.user.operator_id;
        const type = req.user.type;
        
        const target_operator_id = req.body.operator_id

        // Solo il superadmin può disconnettere altri operator
        if (type !== 'admin') {
            throw new Error("Non disponi delle autorizzazioni necessarie per procedere con l'operazione");  
        }

        // Impedisci al superadmin di disconnettere se stesso (deve usare logout)
        if (target_operator_id === requester_operator_id) {
            throw new Error("Non puoi disconnetterti usando questo endpoint, usa /logout");  
        }

        // Verifica che l'operator target appartenga alla stessa organization
        const targetOperator = await verifyOperatorBelongsToOrganization(target_operator_id, organization_id);
        if (!targetOperator) {
            throw new Error("Dipendente non trovato");  
        }

        const deletedCount = await redisSessionService.deleteOperatorSessions(organization_id, target_operator_id, targetOperator.user_id);

        return res.status(200).json({
            status: "Success",
            message: `${deletedCount} sessione/i disconnessa/e con successo`,
            data: {
                disconnected_sessions: deletedCount
            }
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "disconnectOperator";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        return res.status(500).json({
            status: "Failure",
            message: err.message
        });
    }
};

exports.disconnectDevice = async (req, res) => {
    try {
        const organization_id = req.user.organization_id;
        const requester_operator_id = req.user.operator_id;
        const current_session_id = req.user.session_id;
        const type = req.user.type;

        const target_operator_id = req.body.operator_id;
        const target_session_id = req.body.session_id;

        // Verifica che l'operator target appartenga alla stessa organization
        const targetOperator = await verifyOperatorBelongsToOrganization(target_operator_id, organization_id);
        if (!targetOperator) {
            throw new Error("Dipendente non trovato");  
        }

        // Se è un superadmin (type = 'admin'), può disconnettere qualsiasi sessione
        // Se è un normale operator, può disconnettere solo le proprie sessioni
        if (type !== 'admin' && target_operator_id !== requester_operator_id) {
            throw new Error("Non disponi delle autorizzazioni necessarie per procedere con l'operazione");  
        }

        // Non permettere di disconnettere la sessione corrente (usare logout)
        if (target_session_id === current_session_id) {
            throw new Error("Non puoi disconnettere la sessione corrente, fai il logout");  
        }

        // Verifica che la sessione esista
        const sessionData = await redisSessionService.getSession(
            organization_id, 
            target_operator_id, 
            targetOperator.user_id, 
            target_session_id
        );

        if (!sessionData) {
            throw new Error("Sessione non trovata o già scaduta"); 
        }

        await redisSessionService.deleteSession(
            organization_id, 
            target_operator_id, 
            targetOperator.user_id, 
            target_session_id
        );

        return res.status(200).json({
            status: "Success",
            message: "Dispositivo disconnesso con successo"
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "disconnectDevice";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        return res.status(500).json({
            status: "Failure",
            message: err.message
        });
    }
};

exports.logout = async (req, res) => {
    try {
        const organization_id = req.user.organization_id;
        const operator_id = req.user.operator_id;
        const user_id = req.user.user_id;
        const session_id = req.user.session_id;

        if (!session_id) {
            throw new Error("Sessione non trovata o già scaduta"); 
        }

        // Elimina la sessione da Redis
        const success = await redisSessionService.deleteSession(organization_id, operator_id, user_id, session_id);
        if (!success) {
            throw new Error("Errore durante il logout o sessione già scaduta"); 
        }

        return res.status(200).json({
            status: "Success",
            message: "Logout effettuato con successo"
        });
    } catch (err) {
        const fileName = path.basename(__filename);
        const functionName = "logout";
        loggerService.printRequestError(fileName, functionName, req.user, req.body, err.message);
        return res.status(500).json({
            status: "Failure",
            message: err.message
        });
    }
};
