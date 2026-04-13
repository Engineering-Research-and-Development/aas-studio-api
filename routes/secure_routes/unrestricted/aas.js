const express = require("express");
const router = express.Router();

const aas = require("../../../controllers/aas");

// ---------------------------------------------------------------------------
// Documents CRUD
// ---------------------------------------------------------------------------

// GET    /aas                 → list all documents for the org
router.get("/", aas.listDocuments);

// POST   /aas                 → create document + initial commit + HEAD + main refs
router.post("/", aas.createDocument);

// GET    /aas/:document_id    → document info + HEAD commit + all refs
router.get("/:document_id", aas.getDocument);

// DELETE /aas/:document_id   → hard delete (admin only)
router.delete("/:document_id", aas.deleteDocument);

// ---------------------------------------------------------------------------
// Versioning — git-style
// ---------------------------------------------------------------------------

// GET    /aas/:document_id/log                              → git log
// Query: ?ref=main  ?status=Draft|Active|Deprecated
router.get("/:document_id/log", aas.log);

// GET    /aas/:document_id/checkout                         → read snapshot at HEAD (or ?commit_id=X ?ref=main)
router.get("/:document_id/checkout", aas.checkout);

// GET    /aas/:document_id/commits/:commit_id               → git show
router.get("/:document_id/commits/:commit_id", aas.showCommit);

// POST   /aas/:document_id/commit                           → git commit
router.post("/:document_id/commit", aas.commit);

// GET    /aas/:document_id/diff/:commit_id_a/:commit_id_b   → git diff
router.get("/:document_id/diff/:commit_id_a/:commit_id_b", aas.diff);

// POST   /aas/:document_id/restore/:commit_id               → git revert (new commit with old snapshot)
router.post("/:document_id/restore/:commit_id", aas.restore);

// PATCH  /aas/:document_id/commits/:commit_id/status        → change lifecycle status
router.patch("/:document_id/commits/:commit_id/status", aas.setCommitStatus);

// ---------------------------------------------------------------------------
// Refs / Branches — git branch / git switch
// ---------------------------------------------------------------------------

// GET    /aas/:document_id/refs                             → list all named refs
router.get("/:document_id/refs", aas.listRefs);

// POST   /aas/:document_id/branches                         → git branch <name> [<start-point>]
router.post("/:document_id/branches", aas.createBranch);

// PUT    /aas/:document_id/branches/:branch_name/head       → git switch <branch>
router.put("/:document_id/branches/:branch_name/head", aas.switchBranch);

module.exports = router;
