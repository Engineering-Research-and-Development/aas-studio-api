const express = require("express");
const router = express.Router();

const aasRemote = require("../../../controllers/aasRemote");

// ---------------------------------------------------------------------------
// Remote AAS server proxy (IDTA Part 2). Phase 1 — read-only.
// The remote target (baseUrl + auth) travels in the request body so the
// connection stays dynamic and credentials never appear in URLs/logs.
// ---------------------------------------------------------------------------

// POST /aas-remote/ping     → check reachability + read server profiles
router.post("/ping", aasRemote.ping);

// POST /aas-remote/shells   → list shells from the remote repository
router.post("/shells", aasRemote.listShells);

// POST /aas-remote/pull     → fetch a shell + its submodels (standard AAS JSON)
router.post("/pull", aasRemote.pull);

module.exports = router;
