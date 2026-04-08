const Redis = require('ioredis');
const crypto = require('crypto');
const path = require('path');
const config = require('../config');

const loggerService = require("./loggerService");

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 giorni in secondi

const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on('error', (err) => {
    loggerService.printError(path.basename(__filename), "Redis Init", [], "Impossible to establish a connection to Redis");
});

redis.on('connect', () => {
    console.log('[Redis Session Service] Connected successfully');
});

/**
 * Genera un ID di sessione univoco
 */
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Crea una chiave Redis per la sessione
 * Formato: AASStudio:s:{organization_id}:o:{operator_id}:u:{user_id}:{session_id}
 */
function getSessionKey(organization_id, operator_id, user_id, session_id) {
    return `AASStudio:s:${organization_id}:o:${operator_id}:u:${user_id}:${session_id}`;
}

/**
 * Usa SCAN invece di KEYS per non bloccare Redis in produzione
 */
async function scanKeys(pattern) {
    const keys = [];
    let cursor = '0';

    do {
        const [newCursor, matchedKeys] = await redis.scan(
            cursor,
            'MATCH', pattern,
            'COUNT', 100
        );
        cursor = newCursor;
        keys.push(...matchedKeys);
    } while (cursor !== '0');

    return keys;
}

module.exports = {
    /**
     * Genera un ID di sessione univoco (esportato per uso esterno)
     */
    generateSessionId: function() {
        return generateSessionId();
    },

    /**
     * Crea una nuova sessione
     */
    createSession: async function(organization_id, operator_id, user_id, session_id, refresh_token, metadata = {}) {
        try {
            const key = getSessionKey(organization_id, operator_id, user_id, session_id);

            const sessionData = {
                refresh_token,
                device: metadata.device || 'unknown',
                ip_address: metadata.ip_address || 'unknown',
                created_at: new Date().toISOString(),
                last_activity: new Date().toISOString()
            };

            await redis.setex(key, SESSION_TTL, JSON.stringify(sessionData));
            
            return session_id;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "createSession", [organization_id, operator_id, user_id, session_id], err.message);
            throw new Error("Errore durante la creazione della sessione");
        }
    },

    /**
     * Ottiene i dati di una sessione
     */
    getSession: async function(organization_id, operator_id, user_id, session_id) {
        try {
            const key = getSessionKey(organization_id, operator_id, user_id, session_id);
            const data = await redis.get(key);
 
            if (!data) {
                return null;
            }

            return JSON.parse(data);
        } catch (err) {
            loggerService.printError(path.basename(__filename), "getSession", [organization_id, operator_id, user_id, session_id], err.message);
            throw new Error("Errore durante il recupero della sessione");
        }
    },

    /**
     * Aggiorna una sessione esistente (per il refresh)
     */
    updateSession: async function(organization_id, operator_id, user_id, session_id, new_refresh_token) {
        try {
            const key = getSessionKey(organization_id, operator_id, user_id, session_id);
            const existingData = await this.getSession(organization_id, operator_id, user_id, session_id);
            
            if (!existingData) {
                throw new Error("Sessione non trovata");
            }

            const sessionData = {
                ...existingData,
                refresh_token: new_refresh_token,
                last_activity: new Date().toISOString()
            };

            await redis.setex(key, SESSION_TTL, JSON.stringify(sessionData));
            
            return true;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "updateSession", [organization_id, operator_id, user_id, session_id], err.message);
            throw err;
        }
    },

    /**
     * Elimina una sessione specifica (logout)
     */
    deleteSession: async function(organization_id, operator_id, user_id, session_id) {
        try {
            const key = getSessionKey(organization_id, operator_id, user_id, session_id);
            const result = await redis.del(key);
            return result > 0;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "deleteSession", [organization_id, operator_id, user_id, session_id], err.message);
            throw new Error("Errore durante l'eliminazione della sessione");
        }
    },

    /**
     * Elimina tutte le sessioni di un operator (es. cambio password)
     */
    deleteOperatorSessions: async function(organization_id, operator_id, user_id) {
        try {
            const pattern = `AASStudio:s:${organization_id}:o:${operator_id}:u:${user_id}:*`;
            const keys = await scanKeys(pattern);
            
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            
            return keys.length;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "deleteOperatorSessions", [organization_id, operator_id, user_id], err.message);
            throw new Error("Errore durante l'eliminazione delle sessioni dell'operatore");
        }
    },

    /**
     * Ottiene tutte le sessioni di un operator
     */
    getOperatorSessions: async function(organization_id, operator_id, user_id) {
        try {
            const pattern = `AASStudio:s:${organization_id}:o:${operator_id}:u:${user_id}:*`;
            const keys = await scanKeys(pattern);
            const sessions = [];

            for (const key of keys) {
                const parts = key.split(':');
                const session_id = parts[7];
                const data = await redis.get(key);
                
                if (data) {
                    const sessionData = JSON.parse(data);
                    sessions.push({
                        session_id,
                        device: sessionData.device,
                        ip_address: sessionData.ip_address,
                        created_at: sessionData.created_at,
                        last_activity: sessionData.last_activity
                    });
                }
            }

            return sessions;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "getOperatorSessions", [organization_id, operator_id, user_id], err.message);
            throw new Error("Errore durante il recupero delle sessioni dell'operatore");
        }
    },

    /**
     * Ottiene tutte le sessioni di una organization (per superadmin)
     */
    getSupplierSessions: async function(organization_id) {
        try {
            const pattern = `AASStudio:s:${organization_id}:o:*:*`;
            const keys = await scanKeys(pattern);
            const sessions = [];

            for (const key of keys) {
                const parts = key.split(':');
                const operator_id = parts[4];
                const session_id = parts[7];
                const data = await redis.get(key);
                
                if (data) {
                    const sessionData = JSON.parse(data);
                    sessions.push({
                        operator_id: parseInt(operator_id),
                        session_id,
                        device: sessionData.device,
                        ip_address: sessionData.ip_address,
                        created_at: sessionData.created_at,
                        last_activity: sessionData.last_activity
                    });
                }
            }

            return sessions;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "getSupplierSessions", [organization_id], err.message);
            throw new Error("Errore durante il recupero delle sessioni della organization");
        }
    },

    /**
     * Verifica se una sessione è valida
     */
    isValidSession: async function(organization_id, operator_id, user_id, session_id, refresh_token) {
        try {
            const sessionData = await this.getSession(organization_id, operator_id, user_id, session_id);
            
            if (!sessionData) {
                return false;
            }

            return sessionData.refresh_token === refresh_token;
        } catch (err) {
            loggerService.printError(path.basename(__filename), "isValidSession", [organization_id, operator_id, user_id, session_id], err.message);
            return false;
        }
    },

    /**
     * Chiude la connessione Redis (per graceful shutdown)
     */
    disconnect: async function() {
        await redis.quit();
    }
};
