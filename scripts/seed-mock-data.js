'use strict';

/**
 * Seed script — inserts the 4 mock AAS models into the database.
 *
 * Usage:
 *   node scripts/seed-mock-data.js
 *
 * Prerequisites: DB must be up and migrated. Adjust ORG_ID / OP_ID below
 * to match the organization and operator already present in your DB.
 */

const crypto = require('crypto');
const { models, dbConnection } = require('../models');

// ── Config ──────────────────────────────────────────────────────────────────
const ORG_ID = 1;  // organization_id to associate with the documents
const OP_ID  = 1;  // operator_id of the author (M. Pistone)

// ── Hash utilities (identical to controllers/aas.js) ────────────────────────
function sortKeysReplacer(key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
  }
  return value;
}
function normalizeAndHash(content) {
  const json = JSON.stringify(content, sortKeysReplacer);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return { hash, json };
}
function shortHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

// ── Submodel payloads ────────────────────────────────────────────────────────
const makeNameplate = (aasId) => ({
  id: `urn:idta:aas:submodel:Nameplate:1:0:inst:${aasId}`,
  idShort: 'Nameplate',
  semanticId: 'urn:idta:aas:submodel:Nameplate:1:0',
  description: 'Identificazione produttore IEC 61406',
  category: 'Identification',
  elements: [
    { idShort: 'ManufacturerName', type: 'MultiLanguageProperty', semanticId: '0173-1#02-AAO677#002', required: true, value: {} },
    { idShort: 'ManufacturerProductDesignation', type: 'MultiLanguageProperty', semanticId: '0173-1#02-AAW338#001', required: true, value: {} },
    { idShort: 'SerialNumber', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAM556#002', required: false, value: '' },
    { idShort: 'YearOfConstruction', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAP906#001', required: false, value: '' },
  ],
});

const makeTechnicalData = (aasId) => ({
  id: `urn:idta:aas:submodel:TechnicalData:1:2:inst:${aasId}`,
  idShort: 'TechnicalData',
  semanticId: 'urn:idta:aas:submodel:TechnicalData:1:2',
  description: 'Proprietà tecniche IEC 61360',
  category: 'Technical',
  elements: [
    { idShort: 'GeneralInformation', type: 'SubmodelElementCollection', semanticId: 'urn:idta:td:GeneralInfo', required: true, value: '',
      children: [
        { idShort: 'ManufacturerName', type: 'Property', valueType: 'xs:string', required: true },
        { idShort: 'ProductArticleNumber', type: 'Property', valueType: 'xs:string', required: false },
      ] },
    { idShort: 'TechnicalProperties', type: 'SubmodelElementCollection', semanticId: 'urn:idta:td:TechProps', required: true, value: '', children: [] },
  ],
});

const makeOperationalData = (aasId) => ({
  id: `urn:idta:aas:submodel:OperationalData:1:0:inst:${aasId}`,
  idShort: 'OperationalData',
  semanticId: 'urn:idta:aas:submodel:OperationalData:1:0',
  description: 'Dati operativi real-time',
  category: 'Operational',
  elements: [
    { idShort: 'OperatingHours', type: 'Property', valueType: 'xs:double', semanticId: '0173-1#02-AAV184#001', required: false, value: '' },
    { idShort: 'CycleCount', type: 'Property', valueType: 'xs:int', semanticId: 'urn:idta:op:CycleCount', required: false, value: '' },
    { idShort: 'CurrentTemperature', type: 'Property', valueType: 'xs:double', semanticId: '0173-1#02-AAV232#001', required: false, value: '' },
  ],
});

const makeBillOfMaterial = (aasId) => ({
  id: `urn:idta:aas:submodel:BOM:1:0:inst:${aasId}`,
  idShort: 'BillOfMaterial',
  semanticId: 'urn:idta:aas:submodel:BOM:1:0',
  description: 'Distinta base (BOM)',
  category: 'Structure',
  elements: [
    { idShort: 'BOMEntries', type: 'SubmodelElementCollection', semanticId: 'urn:idta:bom:Entries', required: true, value: '',
      children: [
        { idShort: 'PartNumber', type: 'Property', valueType: 'xs:string', required: true },
        { idShort: 'Quantity', type: 'Property', valueType: 'xs:int', required: true },
        { idShort: 'PartReference', type: 'ReferenceElement', required: false },
      ] },
  ],
});

// ── Mock AAS definitions ─────────────────────────────────────────────────────
const MOCK = [
  {
    doc: { id_short: 'AAS_CentrifugalPump_CP200', aas_id: 'aas-pump-001', asset_id: 'urn:mfr:siemens:pump:cp200:sn-44821', asset_kind: 'Instance', description: 'Digital twin — Centrifugal Pump CP200 Line' },
    submodels: (id) => [makeNameplate(id), makeTechnicalData(id)],
    commits: [
      { version: '1.0.0', revision: 'A', status: 'Deprecated', date: '2025-10-20T16:45:00Z', message: 'Release iniziale con Nameplate e Identification',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'Nameplate', description: 'Nameplate produttore IEC 61406', sort_order: 0 },
          { change_type: 'added', target: 'Property', name: 'Nameplate.ManufacturerName', description: 'Nome produttore', sort_order: 1 },
          { change_type: 'added', target: 'Property', name: 'Nameplate.SerialNumber', description: 'Numero seriale', sort_order: 2 },
          { change_type: 'added', target: 'Submodel', name: 'Identification', description: 'Identificazione asset ECLASS', sort_order: 3 },
          { change_type: 'added', target: 'Property', name: 'Identification.AssetId', description: 'ID univoco asset', sort_order: 4 },
        ] },
      { version: '2.0.0', revision: 'A', status: 'Deprecated', date: '2026-01-05T11:30:00Z', message: 'Ristrutturato Documentation submodel, aggiunto TechnicalData',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'TechnicalData', description: 'Nuovo submodel proprietà tecniche IEC 61360', sort_order: 0 },
          { change_type: 'modified', target: 'Submodel', name: 'HandoverDocumentation', description: 'Ristrutturato con DocumentationCollection', sort_order: 1 },
          { change_type: 'removed', target: 'Property', name: 'Documentation.LegacyField', description: 'Rimosso campo legacy non conforme', sort_order: 2 },
          { change_type: 'added', target: 'Collection', name: 'TechnicalData.GeneralInformation', description: 'Info generali prodotto', sort_order: 3 },
          { change_type: 'added', target: 'Collection', name: 'TechnicalData.TechnicalProperties', description: 'Proprietà tecniche ECLASS', sort_order: 4 },
        ] },
      { version: '2.1.0', revision: 'B', status: 'Deprecated', date: '2026-02-18T09:15:00Z', message: 'Aggiornato Nameplate con nuovi campi IEC 61360',
        diffs: [
          { change_type: 'modified', target: 'Property', name: 'Nameplate.SerialNumber', description: 'Aggiunto semanticId ECLASS 0173-1#02-AAM556#002', sort_order: 0 },
          { change_type: 'added', target: 'Property', name: 'Nameplate.BatchNumber', description: 'Numero lotto produzione', sort_order: 1 },
          { change_type: 'modified', target: 'Submodel', name: 'Nameplate', description: 'Aggiornato semanticId a versione 2.0 IDTA', sort_order: 2 },
        ] },
      { version: '3.0.0', revision: 'A', status: 'Draft', date: '2026-03-10T14:22:00Z', message: 'Aggiunto submodel PredictiveMaintenance con semanticId ECLASS',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'PredictiveMaintenance', description: 'Nuovo submodel manutenzione predittiva con HealthIndex e RUL', sort_order: 0 },
          { change_type: 'added', target: 'Property', name: 'PredictiveMaintenance.HealthIndex', description: 'Indice salute asset (0-100)', sort_order: 1 },
          { change_type: 'added', target: 'Property', name: 'PredictiveMaintenance.RemainingUsefulLife', description: 'Vita utile residua in ore', sort_order: 2 },
          { change_type: 'added', target: 'Collection', name: 'PredictiveMaintenance.MaintenanceSchedule', description: 'Scheduling manutenzione', sort_order: 3 },
        ] },
    ],
  },
  {
    doc: { id_short: 'AAS_IndustrialRobot_KR60', aas_id: 'aas-robot-002', asset_id: 'urn:mfr:kuka:robot:kr60:sn-88412', asset_kind: 'Instance', description: 'Digital twin — KUKA KR 60 HA' },
    submodels: (id) => [makeNameplate(id), makeOperationalData(id)],
    commits: [
      { version: '1.0.0', revision: 'A', status: 'Deprecated', date: '2025-11-01T12:00:00Z', message: 'Prima versione',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'Nameplate', description: 'Nameplate KUKA', sort_order: 0 },
          { change_type: 'added', target: 'Submodel', name: 'Identification', description: 'Identificazione robot', sort_order: 1 },
          { change_type: 'added', target: 'Submodel', name: 'HandoverDocumentation', description: 'Documentazione tecnica', sort_order: 2 },
        ] },
      { version: '1.1.0', revision: 'A', status: 'Deprecated', date: '2026-01-15T08:30:00Z', message: 'Aggiornato Documentation',
        diffs: [
          { change_type: 'modified', target: 'Submodel', name: 'HandoverDocumentation', description: 'Aggiornato struttura documenti', sort_order: 0 },
        ] },
      { version: '1.2.0', revision: 'A', status: 'Active', date: '2026-03-01T10:00:00Z', message: 'Aggiunto OperationalData submodel',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'OperationalData', description: 'Dati operativi real-time', sort_order: 0 },
          { change_type: 'added', target: 'Property', name: 'OperationalData.OperatingHours', description: 'Ore di funzionamento', sort_order: 1 },
          { change_type: 'added', target: 'Property', name: 'OperationalData.CycleCount', description: 'Conteggio cicli', sort_order: 2 },
        ] },
    ],
  },
  {
    doc: { id_short: 'AAS_TempSensor_TS400', aas_id: 'aas-sensor-003', asset_id: 'urn:mfr:bosch:sensor:ts400:sn-12093', asset_kind: 'Instance', description: 'Digital twin — Bosch TS400 Temperature Sensor' },
    submodels: (id) => [makeNameplate(id), makeTechnicalData(id)],
    commits: [
      { version: '1.0.0', revision: 'B', status: 'Deprecated', date: '2025-09-10T09:00:00Z', message: 'Release iniziale',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'Nameplate', description: 'Nameplate Bosch', sort_order: 0 },
          { change_type: 'added', target: 'Submodel', name: 'TechnicalData', description: 'Dati tecnici sensore', sort_order: 1 },
        ] },
      { version: '2.0.0', revision: 'A', status: 'Active', date: '2026-02-28T15:20:00Z', message: 'Migrazione a AAS v3 metamodel',
        diffs: [
          { change_type: 'modified', target: 'Submodel', name: 'Nameplate', description: 'Migrato a schema AAS v3', sort_order: 0 },
          { change_type: 'modified', target: 'Submodel', name: 'TechnicalData', description: 'Allineato a IDTA template v1.2', sort_order: 1 },
          { change_type: 'added', target: 'Property', name: 'TechnicalData.MeasurementRange', description: 'Range misurazione -40°C / +125°C', sort_order: 2 },
          { change_type: 'removed', target: 'Property', name: 'TechnicalData.LegacyAccuracy', description: 'Sostituito con campo conforme IEC', sort_order: 3 },
        ] },
    ],
  },
  {
    doc: { id_short: 'AAS_ConveyorBelt_CB100', aas_id: 'aas-conveyor-004', asset_id: 'urn:mfr:festo:conveyor:cb100:sn-55110', asset_kind: 'Type', description: 'Digital twin — Festo CB100 Conveyor Belt' },
    submodels: (id) => [makeNameplate(id), makeBillOfMaterial(id)],
    commits: [
      { version: '1.0.0', revision: 'A', status: 'Draft', date: '2026-03-05T11:10:00Z', message: 'Modello type iniziale',
        diffs: [
          { change_type: 'added', target: 'Submodel', name: 'Nameplate', description: 'Nameplate Festo', sort_order: 0 },
          { change_type: 'added', target: 'Submodel', name: 'TechnicalData', description: 'Specifiche tecniche nastro', sort_order: 1 },
          { change_type: 'added', target: 'Submodel', name: 'BillOfMaterial', description: 'BOM componenti nastro', sort_order: 2 },
        ] },
    ],
  },
];

// ── Seed logic ───────────────────────────────────────────────────────────────
async function seed() {
  await dbConnection.sequelize.authenticate();
  console.log('✔ DB connected');

  for (const entry of MOCK) {
    const { doc, submodels, commits } = entry;
    const t = await dbConnection.sequelize.transaction();

    try {
      // Idempotency: skip if aas_id already exists for this org
      const existing = await models.AASDocument.findOne({
        where: { aas_id: doc.aas_id, organization_id: ORG_ID },
        transaction: t,
      });
      if (existing) {
        console.log(`⚠  Skipped (already exists): ${doc.id_short}`);
        await t.rollback();
        continue;
      }

      // 1. Create document
      const document = await models.AASDocument.create(
        { ...doc, organization_id: ORG_ID, created_by: OP_ID },
        { transaction: t }
      );

      // 2. Upsert the snapshot (current submodel state)
      const content = { submodels: submodels(doc.aas_id) };
      const { hash } = normalizeAndHash(content);
      await models.AASSnapshot.findOrCreate({
        where: { hash },
        defaults: { hash, content },
        transaction: t,
      });

      // 3. Create commits in chronological order, building the parent chain
      let parentId = null;
      let lastCommitId = null;

      for (const c of commits) {
        const commitHash = shortHash(`${doc.aas_id}:${c.version}:${c.revision}:${c.date}`);
        const commit = await models.AASCommit.create(
          {
            document_id: document.document_id,
            commit_hash: commitHash,
            version: c.version,
            revision: c.revision,
            status: c.status,
            message: c.message,
            author_id: OP_ID,
            parent_commit_id: parentId,
            snapshot_hash: hash,   // all commits share the current snapshot
            createdAt: new Date(c.date),
          },
          { transaction: t }
        );

        // 4. Diff entries for this commit
        if (c.diffs.length > 0) {
          await models.AASCommitDiff.bulkCreate(
            c.diffs.map(d => ({ commit_id: commit.commit_id, ...d })),
            { transaction: t }
          );
        }

        parentId = commit.commit_id;
        lastCommitId = commit.commit_id;
      }

      // 5. Refs — HEAD and main point to the latest (most recent) commit
      await models.AASRef.create({ document_id: document.document_id, ref_name: 'HEAD', commit_id: lastCommitId }, { transaction: t });
      await models.AASRef.create({ document_id: document.document_id, ref_name: 'main', commit_id: lastCommitId }, { transaction: t });

      await t.commit();
      console.log(`✔ Seeded: ${doc.id_short} (${commits.length} commits)`);
    } catch (err) {
      await t.rollback();
      console.error(`✖ Failed: ${doc.id_short}`, err.message);
    }
  }

  console.log('\nSeed complete.');
  await dbConnection.sequelize.close();
}

seed().catch(err => { console.error(err); process.exit(1); });
