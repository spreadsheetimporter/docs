# Integration guide

> How to add server-side spreadsheet import to your **existing RAP project**. Target: **SAP S/4HANA 2023+ (on-prem / private cloud) and SAP BTP ABAP / S/4HANA Cloud Public** — one clean-core codebase. For the stable public surface + the stability policy see the [public API contract](public-api-contract.md); for a runnable example of every API see the [usage cookbook](usage-cookbook.md).
>
> Status: **proven on live S/4HANA 2023 (SAP_BASIS 758)** — installed, EML round-trips and the full ABAP Unit suite green. Early/experimental (`0.x`): the `ZCL_SSI_*` / `ZIF_SSI_*` surface may still change.

## What you get

Your UI5 app's Spreadsheet Importer dialog can, above a configurable row count, send the whole file to
your ABAP backend, which parses it and **creates the data through your own RAP business object via EML**
— so your determinations, validations, numbering and authorizations all run. No data is written behind
your BO's back. You can also hand users a [CREATE template](template-download.md) to download.

## Prerequisites

- S/4HANA 2023+ or ABAP Cloud. The released `XCO_CP_XLSX` read API must be present (it is on 758+;
  verify in ADT: object `XCO_CP_XLSX_READ_ACCESS` resolves).
- Your import target is a **RAP business object** (managed or unmanaged) that is **EML‑create‑enabled**.
- abapGit (ADT plugin) to install the component.

## Step 1 — Install the component

Pull the component's abapGit repo into a package in your system. Everything it uses is a released
(Clean‑Core A) API, so it activates on both on‑prem 2023 and ABAP Cloud.

## Step 2 — Connect your target BO

How much you do depends on your target.

### A. Active, flat or single‑entity BO → zero code

Nothing to implement. You pass the **BO name** (and an optional column→field mapping); the generic
engine builds the create payload at runtime and calls EML. [Extension hooks](extension-hooks.md)
(`ZIF_SSI_HOOKS`) run on this generic path with zero extra setup.

### B. Draft‑enabled BO, deep/composition, or special control → a generated adapter

The generic engine cannot create **drafts** (the dynamic EML API ignores `%is_draft`) and deep
compositions need a compile‑time `TYPE TABLE FOR CREATE`. For these the component **generates** a typed
adapter for you — you don't hand‑write it. Every engine and adapter implements one interface:

```abap
INTERFACE zif_ssi_importer PUBLIC.
  METHODS import
    IMPORTING it_rows          TYPE zif_ssi_types=>tt_row     " parsed cells, by field name
              is_options       TYPE zif_ssi_types=>ts_options " entity, is_draft, chunk size, mapping …
    RETURNING VALUE(rs_result) TYPE zif_ssi_types=>ts_result. " counts + keys + per-row messages
ENDINTERFACE.
```

1. **Generate** the adapter source from your BO's metadata:
   ```abap
   DATA(src) = zcl_ssi_adapter_gen=>generate_deep(   " also: generate_flat / generate_upsert
     iv_class = 'ZCL_SSI_ADP_YOURBO' iv_root = 'ZYOUR_ROOT' iv_alias = 'Root'
     iv_assoc = '_Items' iv_child_alias = 'Item' iv_parent_key = 'ROOTKEY' ).
   ```
   Create that class in your package (~50 lines of typed EML that fills the create lines via
   `ZCL_SSI_UTIL=>fill_line` and returns the result). The **flat** and **upsert** generators set
   `%is_draft` when `is_options-is_draft = abap_true`; `generate_deep` emits **ACTIVE‑CREATE only**
   (draft + deep/composition is out of scope), so `is_draft` is ignored on the deep path.

2. **Register** it once at startup so the factory routes your BO to it:
   ```abap
   zcl_ssi_factory=>register( iv_entity = 'ZYOUR_ROOT' iv_class = 'ZCL_SSI_ADP_YOURBO' ).
   ```
   `zcl_ssi_import=>import_file( … )` then resolves engine‑vs‑adapter automatically.

### Essentials regardless of path

- **Mandatory fields:** `field(mandatory)` is **not** enforced on EML import (it's a UI hint). For a
  hard rule, add a `validation … on save` — it *will* run on import. (`field(mandatory:create)` is enforced.)
- **Readonly / derived fields** (parent keys, determination‑filled): don't expect them in the file; mark
  them `readonly` in the BDEF.
- The import runs as the **logged‑in user**, so your BO's instance authorizations apply.

## Step 3 — Frontend configuration (UI5 Spreadsheet Importer)

```js
settings: {
  directUploadConfig: {
    enabled: true,
    mode: "rap",                       // RAP backend (vs "cap")
    uploadUrl: "/sap/opu/odata4/sap/<binding>/srvd/sap/<service>/0001/…",
    targetEntity: "ZI_YOUR_BO",        // the BO to import into
    rowThreshold: 500,                  // ≤ threshold → parse in browser; above → send to backend
    draft: false,                       // create drafts (requires an adapter, step 2B)
    useCsrf: true,                      // RAP/Gateway needs x-csrf-token + credentials
    mapping: { /* optional: header → field overrides */ }
  }
}
```

Below `rowThreshold` the component keeps parsing in the browser (rich inline validation); above it, the
file goes to your RAP backend. For the action that receives the file, see
[Fiori Elements & file upload](fiori-elements.md).

## Step 4 — How results come back

- **Success:** counts of created rows (+ created keys, mapped from each spreadsheet row).
- **Errors:** per‑row messages from your BO's validations. Validation messages surface on the `COMMIT`
  response, so the engine captures both the MODIFY and COMMIT responses and maps each message to its row.
- ⚠️ **All‑or‑nothing per commit:** if one row fails a validation, the **whole commit chunk** is
  rejected. The engine commits in **chunks** so one bad row doesn't sink a 10 000‑row file — tune
  `chunk_size` to your atomicity needs.

## Backend processing model

The engine calls `COMMIT ENTITIES`, illegal **inside** a RAP behavior handler — so it has two modes,
chosen by the `defer_commit` option:

- **Synchronous** (default for the OData import action): the action runs the engine with
  `defer_commit = abap_true`; the engine does the `MODIFY ENTITIES` and the RAP framework commits at the
  end of the OData request. The frontend's single POST returns after every row is imported. One
  transaction → atomic.
- **Asynchronous** (very large files): ships as a **separate optional package** — it stores the file as
  a run and a background job calls `zcl_ssi_runner=>process_pending( )` to import it chunked while the UI
  polls. Use it when one request/transaction would be too large.
- **Your own controller / job:** call `zcl_ssi_import=>import_file( … )` directly (default
  `defer_commit = false` → the engine owns `COMMIT`, chunked) from any non‑handler class.

## Upgrades & clean core

The component consumes only released (Clean‑Core A) APIs and is ABAP‑Cloud‑ready and upgrade‑stable.
Follow the component's documented upgrade path (don't hand‑patch). Its public surface *can* be C1‑released
for cross‑software‑component use on a Cloud target — not required for same‑component consumption (details
under [Fiori Elements & file upload](fiori-elements.md)).

## Read next

| Page | When you need it |
|---|---|
| [Fiori Elements & file upload](fiori-elements.md) | Add an "upload & import" action to your BO; surface it in a Fiori Elements app |
| [Options & data types](options.md) | The full `ts_options`, the end‑user data rules, amounts/quantities parsing |
| [Extension hooks](extension-hooks.md) | Inject validate/filter/coerce/observe logic without forking |
| [Template download](template-download.md) | Give users a CREATE template that re‑imports zero‑config |
| [Troubleshooting & limits](troubleshooting.md) | Symptom → cause → fix, and the current limits |
| [Public API contract](public-api-contract.md) | What's stable, the exception taxonomy, the stability policy |
