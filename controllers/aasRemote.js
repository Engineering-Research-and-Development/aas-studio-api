const path = require("path");
const axios = require("axios");

const loggerService = require("../services/loggerService");

// ---------------------------------------------------------------------------
// Remote AAS server proxy (IDTA 01002-3-0 Part 2 — HTTP/REST).
//
// AAS Studio talks to a live AAS repository (BaSyx / FA³ST / AASX Server) the
// way git talks to a remote. This controller is the server-side proxy: it
// avoids browser CORS, keeps credentials off the client, and is the single
// choke point for an SSRF allowlist. Phase 1 is read-only: ping / list / pull.
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15000;

// Cloud metadata / link-local endpoints we never proxy to.
const BLOCKED_HOSTS = new Set([
  "169.254.169.254",        // AWS/GCP/Azure IMDS
  "metadata.google.internal",
  "metadata",
]);

/**
 * Validate + normalize a remote base URL (strip trailing slash). Throws on
 * anything that is not a plain http/https URL or that targets a blocked host.
 */
function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error("baseUrl mancante");
  }
  let u;
  try {
    u = new URL(baseUrl.trim());
  } catch {
    throw new Error("baseUrl non valido");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("baseUrl deve usare http o https");
  }
  if (BLOCKED_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error("Host di destinazione non consentito");
  }
  return u.origin + u.pathname.replace(/\/+$/, "");
}

/**
 * Build outbound auth headers for the configured connection.
 * Supported: none | bearer | basic | apiKey.
 */
function authHeaders(auth) {
  if (!auth || !auth.type || auth.type === "none") return {};
  if (auth.type === "bearer" && auth.token) {
    return { Authorization: `Bearer ${auth.token}` };
  }
  if (auth.type === "basic" && auth.username != null) {
    const encoded = Buffer.from(`${auth.username}:${auth.password || ""}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  if (auth.type === "apiKey" && auth.header && auth.value) {
    return { [auth.header]: auth.value };
  }
  return {};
}

/** AAS API identifiers travel base64url-encoded inside the path. */
function b64url(id) {
  return Buffer.from(String(id)).toString("base64url");
}

/** GET against the remote; never throws on HTTP status so callers can branch. */
async function remoteGet(baseUrl, subPath, auth, params) {
  return axios.get(`${baseUrl}${subPath}`, {
    headers: { Accept: "application/json", ...authHeaders(auth) },
    params,
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
    maxRedirects: 0,
  });
}

/** Normalize an AAS paged response: `{ result, paging_metadata }` or bare array. */
function pagedItems(data) {
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * POST /aas-remote/ping
 * Body: { baseUrl, auth? }
 * Checks reachability via GET /description, falling back to GET /shells?limit=1.
 */
exports.ping = async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body.baseUrl);
    const { auth } = req.body;

    const descr = await remoteGet(baseUrl, "/description", auth);
    if (descr.status >= 200 && descr.status < 300) {
      return res.status(200).json({
        status: "Success",
        data: { reachable: true, baseUrl, profiles: descr.data?.profiles || [] },
      });
    }

    const shells = await remoteGet(baseUrl, "/shells", auth, { limit: 1 });
    const reachable = shells.status >= 200 && shells.status < 300;
    return res.status(200).json({
      status: "Success",
      data: { reachable, baseUrl, profiles: [], statusCode: reachable ? 200 : shells.status },
    });
  } catch (err) {
    return res.status(400).json({ status: "Failure", message: err.message });
  }
};

/**
 * POST /aas-remote/shells
 * Body: { baseUrl, auth?, cursor?, limit? }
 * Lists shells from the remote repository (one page).
 */
exports.listShells = async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body.baseUrl);
    const { auth, cursor, limit = 100 } = req.body;

    const r = await remoteGet(baseUrl, "/shells", auth, { limit, ...(cursor ? { cursor } : {}) });
    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({ status: "Failure", message: `Server remoto: HTTP ${r.status}` });
    }
    return res.status(200).json({
      status: "Success",
      data: { shells: pagedItems(r.data), paging: r.data?.paging_metadata || null },
    });
  } catch (err) {
    return res.status(400).json({ status: "Failure", message: err.message });
  }
};

/**
 * POST /aas-remote/pull
 * Body: { baseUrl, auth?, shellId? }
 * Fetches a shell and resolves the submodels it references. Returns the raw
 * standard-AAS JSON ({ shell, submodels }); the frontend maps it to the
 * internal model and loads it as a working copy.
 */
exports.pull = async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body.baseUrl);
    const { auth, shellId } = req.body;

    let shell = null;
    if (shellId) {
      const r = await remoteGet(baseUrl, `/shells/${b64url(shellId)}`, auth);
      if (r.status >= 200 && r.status < 300) shell = r.data;
    }
    if (!shell) {
      const list = await remoteGet(baseUrl, "/shells", auth, { limit: 1 });
      shell = pagedItems(list.data)[0] || null;
    }
    if (!shell) {
      return res.status(404).json({ status: "Failure", message: "Nessuna shell trovata sul server remoto" });
    }

    // Collect referenced submodel ids from the shell's submodel references.
    const refs = Array.isArray(shell.submodels) ? shell.submodels : [];
    const submodelIds = refs
      .map((ref) => {
        const keys = Array.isArray(ref?.keys) ? ref.keys : [];
        const smKey = keys.find((k) => k.type === "Submodel") || keys[keys.length - 1];
        return smKey && smKey.value;
      })
      .filter(Boolean);

    const submodels = [];
    const failed = [];
    for (const id of submodelIds) {
      const r = await remoteGet(baseUrl, `/submodels/${b64url(id)}`, auth);
      if (r.status >= 200 && r.status < 300 && r.data) submodels.push(r.data);
      else failed.push({ id, statusCode: r.status });
    }

    return res.status(200).json({
      status: "Success",
      data: { shell, submodels, failed },
    });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "pull", req.user, req.body, err.message);
    return res.status(400).json({ status: "Failure", message: err.message });
  }
};
