const path = require("path");
const crypto = require("crypto");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const { models, dbConnection } = require("../models");
const loggerService = require("../services/loggerService");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a JSON object and compute its SHA-256 hash.
 * Keys are sorted recursively so identical content always produces the same hash,
 * regardless of insertion order (content-addressable, like git blob objects).
 */
function normalizeAndHash(content) {
  const normalized = JSON.parse(JSON.stringify(content)); // deep clone
  const json = JSON.stringify(normalized, sortKeysReplacer);
  const hash = crypto.createHash("sha256").update(json).digest("hex");
  return { hash, json };
}

function sortKeysReplacer(key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value).sort().reduce((sorted, k) => {
      sorted[k] = value[k];
      return sorted;
    }, {});
  }
  return value;
}

/**
 * Generate a short 8-char hex commit hash (git-style short SHA).
 */
function shortHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * Increment semantic version patch segment.  "1.0.0" → "1.0.1"
 */
function bumpVersion(versionStr) {
  const parts = versionStr.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return versionStr;
  parts[2] += 1;
  return parts.join(".");
}

/**
 * Compute the next revision letter.  A → B, Z → AA, AZ → BA …
 */
function nextRevision(rev) {
  const chars = rev.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < "Z") {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join("");
    }
    chars[i] = "A";
    i--;
  }
  return "A" + chars.join("");
}

/**
 * Upsert a snapshot: if the hash already exists (same content) reuse it.
 * Returns the AASSnapshot instance.
 */
// NOTE: intentionally NO transaction parameter.
// InnoDB FK checks read *committed* data only. If snapshot and commit are in the same
// transaction, the FK check on AASCommit cannot see the uncommitted AASSnapshot row and
// raises error 1452. By committing the snapshot first (auto-commit), the row is visible
// to the FK check when AASCommit is inserted inside the main transaction.
async function upsertSnapshot(content) {
  const { hash } = normalizeAndHash(content);
  await models.AASSnapshot.upsert({ hash, content });
  const snap = await models.AASSnapshot.findOne({ where: { hash } });
  if (!snap) throw new Error(`Snapshot non trovato dopo upsert (hash=${hash})`);
  return snap;
}

/**
 * Load the JSON content of a snapshot by hash. Returns null when the hash is
 * missing (e.g. the very first commit has no parent snapshot).
 */
async function loadSnapshotContent(snapshot_hash, transaction = null) {
  if (!snapshot_hash) return null;
  const opts = { where: { hash: snapshot_hash } };
  if (transaction) opts.transaction = transaction;
  const snap = await models.AASSnapshot.findOne(opts);
  return snap ? snap.content : null;
}

/**
 * Resolve the commit that HEAD (or a named ref) points to for a document.
 * Returns null if the ref doesn't exist yet.
 */
async function resolveRef(document_id, ref_name = "HEAD", transaction = null, lock = false) {
  const refOpts = {
    where: {
      document_id: { [Op.eq]: document_id },
      ref_name: { [Op.eq]: ref_name }
    }
  };
  if (transaction) { refOpts.transaction = transaction; if (lock) refOpts.lock = true; }
  const ref = await models.AASRef.findOne(refOpts);
  if (!ref || !ref.commit_id) return null;
  const commitOpts = { where: { commit_id: { [Op.eq]: ref.commit_id } } };
  if (transaction) { commitOpts.transaction = transaction; if (lock) commitOpts.lock = true; }
  return models.AASCommit.findOne(commitOpts);
}

/**
 * Update (or create) a named ref to point to a commit.
 */
async function setRef(document_id, ref_name, commit_id, transaction) {
  const [ref] = await models.AASRef.findOrCreate({
    where: { document_id, ref_name },
    defaults: { document_id, ref_name, commit_id },
    transaction
  });
  if (ref.commit_id !== commit_id) {
    ref.commit_id = commit_id;
    await ref.save({ transaction });
  }
  return ref;
}

/**
 * Verify a document belongs to the caller's organization.
 */
async function findDocumentForOrg(document_id, organization_id) {
  return models.AASDocument.findOne({
    where: {
      document_id: { [Op.eq]: document_id },
      organization_id: { [Op.eq]: organization_id }
    }
  });
}

/**
 * Fetch a commit with its snapshot content and diff entries.
 */
async function fetchCommitFull(commit_id, document_id) {
  return models.AASCommit.findOne({
    where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document_id } },
    include: [
      { model: models.AASSnapshot, as: "snapshot" },
      {
        model: models.AASCommitDiff, as: "diffs",
        required: false,
        order: [["sort_order", "ASC"]]
      },
      {
        model: models.Operator, as: "author",
        attributes: ["operator_id"],
        include: [{ model: models.User, as: "user", attributes: ["user_id", "name", "surname", "email"] }]
      },
      {
        model: models.AASCommit, as: "parent",
        attributes: ["commit_id", "commit_hash", "version", "revision", "status", "message", "createdAt"]
      }
    ]
  });
}

// ---------------------------------------------------------------------------
// Documents CRUD
// ---------------------------------------------------------------------------

/**
 * GET /aas
 * List all AAS documents for the org, with their HEAD commit summary.
 */
exports.listDocuments = async (req, res) => {
  try {
    const { organization_id } = req.user;

    const documents = await models.AASDocument.findAll({
      where: { organization_id: { [Op.eq]: organization_id } },
      order: [["createdAt", "DESC"]]
    });

    const result = await Promise.all(
      documents.map(async (doc) => {
        const headRef = await models.AASRef.findOne({
          where: { document_id: doc.document_id, ref_name: "HEAD" },
          include: [{
            model: models.AASCommit, as: "commit",
            attributes: ["commit_id", "commit_hash", "version", "revision", "status", "message", "createdAt"],
            include: [{ model: models.AASCommitDiff, as: "diffs", required: false }]
          }]
        });
        const allRefs = await models.AASRef.findAll({
          where: { document_id: doc.document_id },
          attributes: ["ref_name", "commit_id"]
        });
        return { ...doc.toJSON(), head: headRef?.commit || null, refs: allRefs.map(r => r.toJSON()) };
      })
    );

    return res.status(200).json({ status: "Success", data: { total: result.length, documents: result } });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "listDocuments", req.user, req.body, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * POST /aas
 * Create a new AAS document and its initial commit on HEAD + main.
 *
 * Body:
 *   id_short      string   required
 *   aas_id        string   required
 *   asset_id      string   required
 *   asset_kind    string   default 'Instance'
 *   description   string   optional
 *   version       string   default '1.0.0'
 *   revision      string   default 'A'
 *   message       string   default 'Initial commit'
 *   content       object   optional  (initial AAS snapshot data)
 *   diffs         array    optional  (initial diff entries)
 */
exports.createDocument = async (req, res) => {
  const { organization_id, operator_id } = req.user;
  const {
    id_short, aas_id, asset_id,
    asset_kind = "Instance", description,
    version = "1.0.0", revision = "A",
    message = "Initial commit",
    content = null, diffs = []
  } = req.body;

  if (!id_short || !aas_id || !asset_id) {
    return res.status(400).json({ status: "Failure", message: "id_short, aas_id e asset_id sono obbligatori" });
  }

  try {
    // Commit snapshot before transaction (InnoDB FK check requires committed rows).
    let snapshot_hash = null;
    if (content) {
      const snap = await upsertSnapshot(content);
      snapshot_hash = snap.hash;
    }

    const commit_hash = shortHash(`${aas_id}:${version}:${revision}:${Date.now()}`);

    const t = await dbConnection.sequelize.transaction();
    try {
      const document = await models.AASDocument.create(
        { id_short, aas_id, asset_id, asset_kind, description, organization_id, created_by: operator_id },
        { transaction: t }
      );

      const commit = await models.AASCommit.create(
        { document_id: document.document_id, commit_hash, version, revision, status: "Draft", message, author_id: operator_id, parent_commit_id: null, snapshot_hash },
        { transaction: t }
      );

      // Caller-provided diffs win; otherwise derive them from the initial content
      // (no parent → everything is reported as "added").
      const effectiveDiffs = Array.isArray(diffs) && diffs.length > 0
        ? diffs
        : (content ? computeAasDiffs(null, content) : []);

      if (effectiveDiffs.length > 0) {
        await models.AASCommitDiff.bulkCreate(
          effectiveDiffs.map((d, idx) => ({ commit_id: commit.commit_id, change_type: d.change_type, target: d.target, name: d.name, description: d.description || null, sort_order: d.sort_order ?? idx })),
          { transaction: t }
        );
      }

      await setRef(document.document_id, "HEAD", commit.commit_id, t);
      await setRef(document.document_id, "main", commit.commit_id, t);

      await t.commit();

      return res.status(201).json({
        status: "Success",
        message: "Documento AAS creato con successo",
        data: { document: document.toJSON(), commit: commit.toJSON(), refs: ["HEAD", "main"] },
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "createDocument", req.user, req.body, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * GET /aas/:document_id
 * Document info + HEAD commit + all refs.
 */
exports.getDocument = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id } = req.params;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const [headRef, allRefs] = await Promise.all([
      models.AASRef.findOne({
        where: { document_id: document.document_id, ref_name: "HEAD" },
        include: [{ model: models.AASCommit, as: "commit", include: [{ model: models.AASSnapshot, as: "snapshot" }] }]
      }),
      models.AASRef.findAll({ where: { document_id: document.document_id } })
    ]);

    return res.status(200).json({
      status: "Success",
      data: { document: document.toJSON(), head: headRef?.commit || null, refs: allRefs.map(r => r.toJSON()) }
    });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "getDocument", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * DELETE /aas/:document_id
 * Hard delete (admin only).
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { organization_id, type } = req.user;
    const { document_id } = req.params;

    if (type !== "admin") {
      return res.status(403).json({ status: "Failure", message: "Solo un amministratore può eliminare un documento AAS" });
    }

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    await document.destroy();
    return res.status(200).json({ status: "Success", message: "Documento AAS eliminato con successo" });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "deleteDocument", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

// ---------------------------------------------------------------------------
// Versioning — git-style operations
// ---------------------------------------------------------------------------

/**
 * GET /aas/:document_id/log
 * Full commit history (git log), newest first.
 * Optional ?ref=main to filter to commits reachable from a specific ref.
 * Optional ?status=Draft|Active|Deprecated
 */
exports.log = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id } = req.params;
    const { status, ref } = req.query;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const where = { document_id: { [Op.eq]: document.document_id } };
    if (status && ["Draft", "Active", "Deprecated"].includes(status)) {
      where.status = { [Op.eq]: status };
    }

    // If a specific ref was requested, resolve it and walk backwards
    if (ref) {
      const tip = await resolveRef(document.document_id, ref);
      if (!tip) return res.status(404).json({ status: "Failure", message: `Ref '${ref}' non trovato` });
      // Load all commits for this document in one query, then walk the parent chain in memory.
      // This is O(1) queries instead of O(n) sequential queries and guards against cycles.
      const allForDoc = await models.AASCommit.findAll({
        where: { document_id: { [Op.eq]: document.document_id } },
        attributes: ["commit_id", "parent_commit_id"],
      });
      const commitMap = new Map(allForDoc.map(c => [c.commit_id, c]));
      const ids = [];
      const visited = new Set();
      let cur = tip;
      while (cur) {
        if (visited.has(cur.commit_id)) break;
        visited.add(cur.commit_id);
        ids.push(cur.commit_id);
        if (!cur.parent_commit_id) break;
        cur = commitMap.get(cur.parent_commit_id) || null;
      }
      where.commit_id = { [Op.in]: ids };
    }

    const commits = await models.AASCommit.findAll({
      where,
      order: [["commit_id", "DESC"]],
      include: [
        { model: models.AASCommitDiff, as: "diffs", required: false, order: [["sort_order", "ASC"]] },
        {
          model: models.Operator, as: "author", attributes: ["operator_id"],
          include: [{ model: models.User, as: "user", attributes: ["user_id", "name", "surname", "email"] }]
        }
      ]
    });

    return res.status(200).json({ status: "Success", data: { total: commits.length, commits } });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "log", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * GET /aas/:document_id/commits/:commit_id
 * Single commit with snapshot content and diff (git show).
 */
exports.showCommit = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id, commit_id } = req.params;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const commit = await fetchCommitFull(commit_id, document.document_id);
    if (!commit) return res.status(404).json({ status: "Failure", message: "Commit non trovato" });

    return res.status(200).json({ status: "Success", data: { commit } });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "showCommit", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * GET /aas/:document_id/checkout
 * Return snapshot content for HEAD (or ?commit_id=X for a specific commit).
 * This is the read-only equivalent of `git checkout` — returns the content
 * without modifying any refs; the frontend applies it locally.
 */
exports.checkout = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id } = req.params;
    const { commit_id, ref = "HEAD" } = req.query;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    let commit;
    if (commit_id) {
      commit = await models.AASCommit.findOne({
        where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document.document_id } },
        include: [{ model: models.AASSnapshot, as: "snapshot" }]
      });
    } else {
      const refRow = await models.AASRef.findOne({
        where: { document_id: document.document_id, ref_name: ref },
        include: [{ model: models.AASCommit, as: "commit", include: [{ model: models.AASSnapshot, as: "snapshot" }] }]
      });
      commit = refRow?.commit || null;
    }

    if (!commit) return res.status(404).json({ status: "Failure", message: "Commit o ref non trovato" });

    return res.status(200).json({
      status: "Success",
      data: {
        commit_id: commit.commit_id,
        commit_hash: commit.commit_hash,
        version: commit.version,
        revision: commit.revision,
        status: commit.status,
        content: commit.snapshot?.content || null
      }
    });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "checkout", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * POST /aas/:document_id/commit
 * Create a new commit on top of HEAD (git commit).
 *
 * Body:
 *   message    string   required
 *   content    object   required  (full new AAS submodel state)
 *   diffs      array    optional  (explicit change entries; computed from content otherwise)
 *   version    string   optional  (override auto-bump)
 *   revision   string   optional  (override auto-increment)
 *   status     string   default 'Draft'
 *   ref        string   default 'HEAD'  (which ref to advance after commit)
 */
exports.commit = async (req, res) => {
  const { organization_id, operator_id } = req.user;
  const { document_id } = req.params;
  const {
    message, content, diffs = [],
    version: reqVersion, revision: reqRevision,
    status = "Draft", ref = "HEAD"
  } = req.body;

  if (!message) {
    return res.status(400).json({ status: "Failure", message: "Il campo 'message' è obbligatorio" });
  }

  try {
    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) {
      return res.status(404).json({ status: "Failure", message: "Documento non trovato" });
    }

    // InnoDB FK checks read committed data only, so the snapshot must be committed
    // BEFORE the main transaction that inserts AASCommit starts.
    let snapshot_hash = null;
    if (content) {
      const snap = await upsertSnapshot(content);
      snapshot_hash = snap.hash;
    }

    const t = await dbConnection.sequelize.transaction();
    try {
      // Lock the ref row so concurrent commits cannot read the same parent and fork history.
      const parentCommit = await resolveRef(document.document_id, ref, t, true);

      let version, revision;
      if (reqVersion) {
        version = reqVersion;
        revision = reqRevision || "A";
      } else if (reqRevision) {
        version = parentCommit ? parentCommit.version : "1.0.0";
        revision = reqRevision;
      } else if (parentCommit) {
        version = bumpVersion(parentCommit.version);
        revision = "A";
      } else {
        version = "1.0.0";
        revision = "A";
      }

      const commit_hash = shortHash(`${document_id}:${version}:${revision}:${message}:${Date.now()}`);

      const newCommit = await models.AASCommit.create(
        {
          document_id: document.document_id,
          commit_hash, version, revision, status, message,
          author_id: operator_id,
          parent_commit_id: parentCommit ? parentCommit.commit_id : null,
          snapshot_hash,
        },
        { transaction: t }
      );

      // Caller-provided diffs win; otherwise derive a semantic changelog by
      // comparing the parent snapshot with the new content. This is what the
      // endpoint always promised ("computed from content otherwise").
      const effectiveDiffs = Array.isArray(diffs) && diffs.length > 0
        ? diffs
        : (content
            ? computeAasDiffs(await loadSnapshotContent(parentCommit ? parentCommit.snapshot_hash : null, t), content)
            : []);

      if (effectiveDiffs.length > 0) {
        await models.AASCommitDiff.bulkCreate(
          effectiveDiffs.map((d, idx) => ({
            commit_id: newCommit.commit_id,
            change_type: d.change_type, target: d.target, name: d.name,
            description: d.description || null, sort_order: d.sort_order ?? idx,
          })),
          { transaction: t }
        );
      }

      await setRef(document.document_id, ref, newCommit.commit_id, t);
      if (ref !== "HEAD") {
        await setRef(document.document_id, "HEAD", newCommit.commit_id, t);
      }

      await t.commit();

      return res.status(201).json({
        status: "Success",
        message: "Commit creato con successo",
        data: { commit: newCommit.toJSON(), snapshot_hash, ref_advanced: ref },
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "commit", req.user, req.body, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * GET /aas/:document_id/diff/:commit_id_a/:commit_id_b
 * Compare two commits: structural JSON diff of their snapshots (git diff).
 */
exports.diff = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id, commit_id_a, commit_id_b } = req.params;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const [commitA, commitB] = await Promise.all([
      models.AASCommit.findOne({
        where: { commit_id: { [Op.eq]: commit_id_a }, document_id: { [Op.eq]: document.document_id } },
        include: [
          { model: models.AASSnapshot, as: "snapshot" },
          { model: models.AASCommitDiff, as: "diffs", required: false, order: [["sort_order", "ASC"]] }
        ]
      }),
      models.AASCommit.findOne({
        where: { commit_id: { [Op.eq]: commit_id_b }, document_id: { [Op.eq]: document.document_id } },
        include: [
          { model: models.AASSnapshot, as: "snapshot" },
          { model: models.AASCommitDiff, as: "diffs", required: false, order: [["sort_order", "ASC"]] }
        ]
      })
    ]);

    if (!commitA || !commitB) {
      return res.status(404).json({ status: "Failure", message: "Uno o entrambi i commit non trovati" });
    }

    // Structural diff of the two snapshots
    const diffResult = computeJsonDiff(
      commitA.snapshot?.content || {},
      commitB.snapshot?.content || {}
    );

    return res.status(200).json({
      status: "Success",
      data: {
        from: buildCommitSummary(commitA),
        to: buildCommitSummary(commitB),
        diff: diffResult
      }
    });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "diff", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

function buildCommitSummary(commit) {
  return {
    commit_id: commit.commit_id,
    commit_hash: commit.commit_hash,
    version: `${commit.version} rev ${commit.revision}`,
    status: commit.status,
    message: commit.message,
    snapshot_hash: commit.snapshot_hash,
    createdAt: commit.createdAt,
    diffs: commit.diffs
  };
}

/**
 * Compute a structural diff between two JSON objects.
 * Returns arrays of added, removed, and changed property paths.
 */
function computeJsonDiff(objA, objB, prefix = "") {
  const added = [], removed = [], changed = [];

  const keysA = new Set(Object.keys(objA || {}));
  const keysB = new Set(Object.keys(objB || {}));

  for (const k of keysB) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (!keysA.has(k)) {
      added.push({ path: fullKey, value: objB[k] });
    } else if (objA[k] !== null && objB[k] !== null && typeof objA[k] === "object" && typeof objB[k] === "object" && !Array.isArray(objA[k]) && !Array.isArray(objB[k])) {
      const nested = computeJsonDiff(objA[k], objB[k], fullKey);
      added.push(...nested.added);
      removed.push(...nested.removed);
      changed.push(...nested.changed);
    } else if (JSON.stringify(objA[k]) !== JSON.stringify(objB[k])) {
      changed.push({ path: fullKey, from: objA[k], to: objB[k] });
    }
  }

  for (const k of keysA) {
    if (!keysB.has(k)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      removed.push({ path: fullKey, value: objA[k] });
    }
  }

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// AAS-aware changelog diff (powers the Lifecycle timeline)
// ---------------------------------------------------------------------------

/**
 * Map a submodel element to the `target` label used by the changelog UI.
 */
function elementTarget(el) {
  switch (el && el.type) {
    case "SubmodelElementCollection": return "Collection";
    case "MultiLanguageProperty": return "Property";
    case "Operation": return "Operation";
    case "File": return "File";
    case "Blob": return "Blob";
    case "ReferenceElement": return "ReferenceElement";
    default: return "Property";
  }
}

/**
 * Stable signature of an element's editable content, used to detect "modified".
 */
function elementSignature(el) {
  if (!el) return "";
  return JSON.stringify({
    type: el.type,
    valueType: el.valueType || null,
    semanticId: el.semanticId || null,
    value: el.value === undefined ? null : el.value,
    contentType: el.contentType || null,
    children: Array.isArray(el.children)
      ? el.children.map(c => ({ idShort: c.idShort, type: c.type, valueType: c.valueType || null, semanticId: c.semanticId || null }))
      : null,
  });
}

function indexByIdShort(arr) {
  const m = new Map();
  (Array.isArray(arr) ? arr : []).forEach(x => { if (x && x.idShort != null) m.set(x.idShort, x); });
  return m;
}

/**
 * Compute semantic changelog entries between two snapshot contents.
 * Produces { change_type, target, name, description, sort_order } rows that the
 * Lifecycle UI renders directly (target = Submodel/Property/Collection/…,
 * name = "Submodel.Element"). Either side may be null — a null `prevContent`
 * means the initial commit, so everything is reported as "added".
 */
function computeAasDiffs(prevContent, nextContent) {
  const diffs = [];
  let order = 0;
  const push = (change_type, target, name, description) =>
    diffs.push({ change_type, target, name, description: description || null, sort_order: order++ });

  const prev = prevContent || {};
  const next = nextContent || {};

  // AAS-level metadata (only when comparing against an existing snapshot)
  if (prevContent) {
    if (next.idShort != null && prev.idShort !== next.idShort) push("modified", "AAS", "idShort", "idShort aggiornato");
    if (next.assetId != null && prev.assetId !== next.assetId) push("modified", "AAS", "globalAssetId", "globalAssetId aggiornato");
    if (next.description != null && prev.description !== next.description) push("modified", "AAS", "description", "Descrizione aggiornata");
  }

  const prevSms = indexByIdShort(prev.submodels);
  const nextSms = indexByIdShort(next.submodels);

  // Added / modified submodels
  for (const [idShort, sm] of nextSms) {
    if (!prevSms.has(idShort)) {
      push("added", "Submodel", idShort, sm.description);
      for (const el of (sm.elements || [])) push("added", elementTarget(el), `${idShort}.${el.idShort}`, null);
      continue;
    }
    const prevSm = prevSms.get(idShort);
    if (prevSm.semanticId !== sm.semanticId || prevSm.description !== sm.description || prevSm.id !== sm.id) {
      push("modified", "Submodel", idShort, "Metadati submodel aggiornati");
    }
    const prevEls = indexByIdShort(prevSm.elements);
    const nextEls = indexByIdShort(sm.elements);
    for (const [elId, el] of nextEls) {
      if (!prevEls.has(elId)) push("added", elementTarget(el), `${idShort}.${elId}`, null);
      else if (elementSignature(prevEls.get(elId)) !== elementSignature(el)) push("modified", elementTarget(el), `${idShort}.${elId}`, null);
    }
    for (const [elId, el] of prevEls) {
      if (!nextEls.has(elId)) push("removed", elementTarget(el), `${idShort}.${elId}`, null);
    }
  }

  // Removed submodels
  for (const [idShort, sm] of prevSms) {
    if (!nextSms.has(idShort)) push("removed", "Submodel", idShort, sm.description);
  }

  return diffs;
}

/**
 * POST /aas/:document_id/restore/:commit_id
 * Create a new commit whose content equals the target commit's snapshot (git revert).
 */
exports.restore = async (req, res) => {
  try {
    const { organization_id, operator_id } = req.user;
    const { document_id, commit_id } = req.params;
    const { message: reqMessage, status = "Draft" } = req.body;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const targetCommit = await models.AASCommit.findOne({
      where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document.document_id } },
      include: [
        { model: models.AASSnapshot, as: "snapshot" },
        { model: models.AASCommitDiff, as: "diffs", required: false }
      ]
    });
    if (!targetCommit) return res.status(404).json({ status: "Failure", message: "Commit di destinazione non trovato" });

    const t = await dbConnection.sequelize.transaction();
    try {
      // Lock HEAD to prevent concurrent commits/restores from forking history.
      const headCommit = await resolveRef(document.document_id, "HEAD", t, true);
      const newVersion = headCommit ? bumpVersion(headCommit.version) : "1.0.0";
      const message = reqMessage || `Restore to ${targetCommit.commit_hash} (v${targetCommit.version} rev ${targetCommit.revision})`;

      const commit_hash = shortHash(`restore:${document_id}:${targetCommit.commit_id}:${Date.now()}`);

      const restoreCommit = await models.AASCommit.create(
        {
          document_id: document.document_id,
          commit_hash,
          version: newVersion,
          revision: "A",
          status,
          message,
          author_id: operator_id,
          parent_commit_id: headCommit ? headCommit.commit_id : null,
          snapshot_hash: targetCommit.snapshot_hash
        },
        { transaction: t }
      );

      if (targetCommit.diffs?.length > 0) {
        await models.AASCommitDiff.bulkCreate(
          targetCommit.diffs.map((d, idx) => ({ commit_id: restoreCommit.commit_id, change_type: d.change_type, target: d.target, name: d.name, description: d.description, sort_order: idx })),
          { transaction: t }
        );
      }

      await setRef(document.document_id, "HEAD", restoreCommit.commit_id, t);

      await t.commit();

      return res.status(201).json({
        status: "Success",
        message: `Restore completato: nuovo commit ${restoreCommit.commit_hash}`,
        data: { commit: restoreCommit.toJSON(), restored_from: targetCommit.commit_hash }
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "restore", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * PUT /aas/:document_id/commits/:commit_id/status
 * Promote / demote a commit status.
 * Promoting to 'Active' auto-deprecates any other Active commit.
 */
exports.setCommitStatus = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id, commit_id } = req.params;
    const { status } = req.body;

    const VALID = ["Draft", "Active", "Deprecated"];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ status: "Failure", message: `'status' deve essere uno tra: ${VALID.join(", ")}` });
    }

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const commit = await models.AASCommit.findOne({ where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document.document_id } } });
    if (!commit) return res.status(404).json({ status: "Failure", message: "Commit non trovato" });

    const t = await dbConnection.sequelize.transaction();
    try {
      if (status === "Active") {
        await models.AASCommit.update(
          { status: "Deprecated" },
          { where: { document_id: { [Op.eq]: document.document_id }, status: { [Op.eq]: "Active" }, commit_id: { [Op.ne]: commit.commit_id } }, transaction: t }
        );
      }

      commit.status = status;
      await commit.save({ transaction: t });
      await t.commit();

      return res.status(200).json({
        status: "Success",
        message: `Stato aggiornato a '${status}'`,
        data: { commit_id: commit.commit_id, commit_hash: commit.commit_hash, status: commit.status }
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "setCommitStatus", req.user, req.body, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

// ---------------------------------------------------------------------------
// Branch operations
// ---------------------------------------------------------------------------

/**
 * GET /aas/:document_id/refs
 * List all named refs (HEAD, branches) for the document.
 */
exports.listRefs = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id } = req.params;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const refs = await models.AASRef.findAll({
      where: { document_id: document.document_id },
      include: [{
        model: models.AASCommit, as: "commit",
        attributes: ["commit_id", "commit_hash", "version", "revision", "status", "message", "createdAt"]
      }]
    });

    return res.status(200).json({ status: "Success", data: { refs } });
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "listRefs", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * POST /aas/:document_id/branches
 * Create a new named branch pointing to a commit (git branch <name> [<start-point>]).
 *
 * Body:
 *   branch_name   string   required   name for the new ref (e.g., 'release-2.0')
 *   commit_id     number   optional   start point; defaults to HEAD
 */
exports.createBranch = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id } = req.params;
    const { branch_name, commit_id } = req.body;

    if (!branch_name || branch_name === "HEAD") {
      return res.status(400).json({ status: "Failure", message: "branch_name è obbligatorio e non può essere 'HEAD'" });
    }

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    // Resolve start point before opening the transaction.
    let startCommit;
    if (commit_id) {
      startCommit = await models.AASCommit.findOne({ where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document.document_id } } });
      if (!startCommit) return res.status(404).json({ status: "Failure", message: "Commit di partenza non trovato" });
    } else {
      startCommit = await resolveRef(document.document_id, "HEAD");
      if (!startCommit) return res.status(400).json({ status: "Failure", message: "Il documento non ha ancora commit" });
    }

    const t = await dbConnection.sequelize.transaction();
    try {
      // Existence check inside the transaction so concurrent creations of the same
      // branch name get a proper 409 instead of an unhandled unique-constraint error.
      const existing = await models.AASRef.findOne({ where: { document_id: document.document_id, ref_name: branch_name }, transaction: t });
      if (existing) { await t.rollback(); return res.status(409).json({ status: "Failure", message: `Il branch '${branch_name}' esiste già` }); }

      const ref = await models.AASRef.create({ document_id: document.document_id, ref_name: branch_name, commit_id: startCommit.commit_id }, { transaction: t });
      await t.commit();

      return res.status(201).json({
        status: "Success",
        message: `Branch '${branch_name}' creato su commit ${startCommit.commit_hash}`,
        data: { ref: ref.toJSON(), commit: { commit_id: startCommit.commit_id, commit_hash: startCommit.commit_hash } }
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "createBranch", req.user, req.body, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

/**
 * PUT /aas/:document_id/branches/:branch_name/head
 * Move HEAD to the commit pointed by a branch (git switch / git checkout <branch>).
 * Also optionally updates which commit the branch itself points to.
 *
 * Body:
 *   commit_id   number   optional   if provided, also moves the branch tip
 */
exports.switchBranch = async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { document_id, branch_name } = req.params;
    const { commit_id } = req.body;

    const document = await findDocumentForOrg(document_id, organization_id);
    if (!document) return res.status(404).json({ status: "Failure", message: "Documento non trovato" });

    const branchRef = await models.AASRef.findOne({ where: { document_id: document.document_id, ref_name: branch_name } });
    if (!branchRef) return res.status(404).json({ status: "Failure", message: `Branch '${branch_name}' non trovato` });

    if (commit_id) {
      const target = await models.AASCommit.findOne({ where: { commit_id: { [Op.eq]: commit_id }, document_id: { [Op.eq]: document.document_id } } });
      if (!target) return res.status(404).json({ status: "Failure", message: "Commit non trovato" });
    }

    const t = await dbConnection.sequelize.transaction();
    try {
      if (commit_id) {
        branchRef.commit_id = commit_id;
        await branchRef.save({ transaction: t });
      }

      await setRef(document.document_id, "HEAD", branchRef.commit_id, t);
      await t.commit();

      return res.status(200).json({
        status: "Success",
        message: `HEAD spostato su branch '${branch_name}' (commit ${branchRef.commit_id})`,
        data: { ref_name: branch_name, commit_id: branchRef.commit_id }
      });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    loggerService.printRequestError(path.basename(__filename), "switchBranch", req.user, req.params, err.message);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};
