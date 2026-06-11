# RAP Backend Importer — Integration Guide (for consuming projects)

> How to add server-side spreadsheet import to your **existing RAP project**. Target: **SAP S/4HANA 2023+ (on-prem / private cloud) and SAP BTP ABAP / S/4HANA Cloud Public** — one clean-core codebase. For the stable public surface + the `0.x` stability policy see the [public API contract](public-api-contract.md); for a runnable example of every API (incl. extension hooks) see the [usage cookbook](usage-cookbook.md).
>
> Status: **proven on live S/4HANA 2023 (SAP_BASIS 758)** — installed, EML round-trips and the full ABAP Unit suite green. Pre-1.0 (`0.x`): the `ZCL_SSI_*` / `ZIF_SSI_*` surface may still change in a minor release (the contract tracks what's stable).

## What you get

Your UI5 app's existing Spreadsheet Importer dialog can, above a configurable row count, send the whole file to your ABAP backend, which parses it and **creates the data through your own RAP business object via EML** — so your determinations, validations, numbering and authorizations all run. No data is written behind your BO's back (unlike the CAP plugin's raw DB insert). You can also hand users a **CREATE template** to download (a `.xlsx` whose columns are exactly the fields the importer accepts) — see "Server-side template download" below.

## Prerequisites

- S/4HANA 2023+ or ABAP Cloud. The released `XCO_CP_XLSX` read API must be present (it is on 758+; verify in ADT: object `XCO_CP_XLSX_READ_ACCESS` resolves).
- Your import target is a **RAP business object** (managed or unmanaged) that is **EML-create-enabled** in your system.
- abapGit (ADT plugin) to install the component.

## Step 1 — Install the component

Pull the component's abapGit repo into a package in your system. It ships as a clean-core software component; everything it uses is a released (Clean-Core A) API, so it activates on both on-prem 2023 and ABAP Cloud. (For productive use, install it under its reserved namespace to avoid version collisions — see "Upgrades" below.)

## Step 2 — Connect your target BO

How much you do depends on your target:

### A. Active, flat or single-entity BO → **zero code**
Nothing to implement. You pass the **BO name** (and an optional column→field mapping) from the frontend; the generic engine builds the create payload at runtime and calls EML. This is the "name your BO" case. Extension hooks (`ZIF_SSI_HOOKS` — see [Extension hooks](#extension-hooks-zif_ssi_hooks)) run on this generic path with zero extra setup.

### B. Draft-enabled BO, deep/composition import, or special control → **a generated adapter**
The generic engine cannot create **drafts** (the dynamic EML API ignores `%is_draft`) and deep compositions need a compile-time `TYPE TABLE FOR CREATE`. For these, the component **generates** a typed adapter for you — you don't hand-write it. The adapter implements the one shipped interface:

```abap
" the single contract (engine and every adapter implement it):
INTERFACE zif_ssi_importer PUBLIC.
  METHODS import
    IMPORTING it_rows          TYPE zif_ssi_types=>tt_row     " parsed cells, by field name
              is_options       TYPE zif_ssi_types=>ts_options " entity, is_draft, chunk size, mapping …
    RETURNING VALUE(rs_result) TYPE zif_ssi_types=>ts_result. " counts + keys + per-row messages
ENDINTERFACE.
```

1. **Generate** the adapter source from your BO's metadata:
   ```abap
   " deep (denormalised sheet: rows sharing the root key become one root + N children)
   DATA(src) = zcl_ssi_adapter_gen=>generate_deep(
     iv_class = 'ZCL_SSI_ADP_YOURBO' iv_root = 'z_your_root' iv_alias = 'Root'
     iv_assoc = '_Items' iv_child_alias = 'Item' iv_parent_key = 'ROOTKEY' ).
   " flat / draft
   DATA(src) = zcl_ssi_adapter_gen=>generate_flat(
     iv_class = 'ZCL_SSI_ADP_YOURBO' iv_root = 'z_your_root' iv_alias = 'Root' ).
   " upsert (create-or-update by key; runtime mode = create / update / upsert)
   DATA(src) = zcl_ssi_adapter_gen=>generate_upsert(
     iv_class = 'ZCL_SSI_ADP_YOURBO' iv_root = 'z_your_root' iv_alias = 'Root' iv_key = 'YourKey' ).
   ```
   Create that class in your package (it's ~50 lines of typed EML that fills the create lines from the generic rows via `ZCL_SSI_UTIL=>fill_line`, sets `%is_draft`, and returns the result). Proven: a generated deep adapter ran its target's on-save determination/validation; a generated draft adapter produced drafts, not active rows.

2. **Register** it once at startup so the factory routes your BO to it:
   ```abap
   zcl_ssi_factory=>register( iv_entity = 'Z_YOUR_ROOT' iv_class = 'ZCL_SSI_ADP_YOURBO' ).
   ```
   The runtime entry point `zcl_ssi_import=>import_file( iv_content … is_options )` then resolves engine-vs-adapter automatically.

### Step 2 essentials regardless of path
- **Mandatory fields:** `field(mandatory)` is **not** enforced on EML import (it's a UI hint). For a hard rule, add a `validation … on save` to your BO — it *will* run on import. (`field(mandatory:create)` is enforced.)
- **Readonly / derived fields** (parent keys, fields filled by determinations): don't expect them in the file; mark them `readonly` in the BDEF.
- The import runs as the **logged-in user**, so your BO's instance authorizations apply.

## Step 3 — Frontend configuration (UI5 Spreadsheet Importer)

```js
settings: {
  directUploadConfig: {
    enabled: true,
    mode: "rap",                       // RAP backend (vs "cap")
    uploadUrl: "/sap/opu/odata4/sap/<binding>/srvd/sap/<service>/0001/…",
    targetEntity: "ZI_YOUR_BO",        // the BO to import into
    rowThreshold: 500,                  // ≤ threshold → parse in browser; above → send file to backend
    draft: false,                       // create drafts (requires an adapter, step 2B)
    useCsrf: true,                      // RAP/Gateway needs x-csrf-token + credentials
    mapping: { /* optional: header → field overrides */ }
  }
}
```
- Below `rowThreshold` the component keeps parsing in the browser (rich inline validation); above it, the file goes to your RAP backend.
- ⚠️ The current `DirectUploader` sends **no CSRF token** and `withCredentials=false` (that suited the CAP plugin). For RAP/Gateway you need a fetched `x-csrf-token` and credentials — enabled by `useCsrf` (a required frontend enhancement).

## Step 4 — How results come back

- Success: counts of created rows (+ created keys, mapped from each spreadsheet row).
- Errors: per-row messages from your BO's validations. **Validation messages surface on the `COMMIT` response**, so the engine captures both the MODIFY and the COMMIT responses and maps each message back to its spreadsheet row.
- ⚠️ **All-or-nothing per commit:** if one row fails a validation, the **whole commit chunk is rejected**. The engine commits in **chunks** so a single bad row doesn't sink a 10 000-row file — but rows inside the same chunk share fate. Tune the chunk size to your atomicity needs.

## Import options (`ts_options`)

Every entry point takes `is_options TYPE zif_ssi_types=>ts_options`. The full field set:

| Field | Type | Meaning | Default |
|---|---|---|---|
| `entity_name` | `string` | Target RAP BO **root entity** (upper-cased internally). **Required.** | — |
| `mode` | `string` | `create` (default) / `update` / `upsert`. `update`/`upsert` need a generated upsert adapter (Step 2B). | `create` |
| `is_draft` | `abap_bool` | Create drafts instead of active rows — needs a generated draft adapter (Step 2B). | `abap_false` |
| `chunk_size` | `i` | Rows per LUW/commit (`0` → default 500). All-or-nothing per chunk. Ignored under `defer_commit` (one batch). | `0` |
| `header_row` | `i` | 1-based row holding the column headers (title/metadata rows above it are skipped). | `1` |
| `decimal_separator` | `c` | `'.'` or `','` to disambiguate amounts/grouped numbers; else the "last separator" heuristic. | (heuristic) |
| `mapping` | `tt_map` | Optional header→field overrides; a `Label [TECHNICAL]` bracket already round-trips zero-config. | (empty) |
| `defer_commit` | `abap_bool` | `abap_true` = engine only does `MODIFY ENTITIES`, the RAP framework commits at request end (use inside an action handler; `ZCL_SSI_IMPORT_ACTION` sets it). `abap_false` = engine owns `COMMIT` (call from your own job). | `abap_false` |
| `hooks` | `REF TO object` | An optional `ZIF_SSI_HOOKS` instance — see [Extension hooks](#extension-hooks-zif_ssi_hooks). | (none) |

The OData action/function parameters (`IsCsv`, `IsDraft`, `ChunkSize`, `DecimalSeparator`, `HeaderRow`) map onto these; on the action path inject `hooks` / `mapping` via the helper's optional `is_options` (see [Extension hooks](#extension-hooks-zif_ssi_hooks)).

## Extension hooks (`ZIF_SSI_HOOKS`)

Inject your own logic into the import pipeline **without forking** the component. Implement the one shipped interface `ZIF_SSI_HOOKS` — every method is `DEFAULT IGNORE`, so you write **only** the hooks you need and the rest stay runtime no-ops — and pass an instance via `ts_options-hooks`.

| Hook | When | What you can do |
|---|---|---|
| `on_rows_parsed` | after parse, before import | validate / transform / **filter** the parsed rows; append an `E` message to **abort** the whole request |
| `coerce_field` | per cell, before the default conversion | **override** how one cell is converted to the target type |
| `on_before_persist` | before each `MODIFY ENTITIES` chunk | **mutate the payload in place** (e.g. stamp defaults) — don't add/remove rows or change `%cid`s |
| `on_message` | per result message | **drop** or **reshape** (text / severity / field) a message |
| `on_completed` | once, after the import | **observe** the final result (audit log, follow-on processing) |

```abap
CLASS zcl_my_hooks DEFINITION CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_ssi_hooks.        " implement a subset; the rest stay no-op (DEFAULT IGNORE)
ENDCLASS.
CLASS zcl_my_hooks IMPLEMENTATION.
  METHOD zif_ssi_hooks~on_rows_parsed.
    " ... filter / validate / transform ct_rows; append an 'E' to ct_messages to abort ...
  ENDMETHOD.
ENDCLASS.

" inject it on the facade / rows entry point:
DATA(result) = zcl_ssi_import=>import_file(
  iv_content = lv_xstring
  is_options = VALUE #( entity_name = 'ZMY_ROOT_ENTITY' hooks = NEW zcl_my_hooks( ) ) ).
```

On the **one-line RAP action** path, inject hooks via the helper's optional `is_options`:

```abap
METHOD import_excel.   " FOR ACTION YourAlias~importExcel
  zcl_ssi_import_action=>execute( EXPORTING it_keys    = keys
                                            iv_entity  = 'ZXX_R_BO'
                                            is_options = VALUE #( hooks = NEW zcl_my_hooks( ) )
                                  CHANGING  ct_result  = result ).
ENDMETHOD.
```

**Rules (the facade never raises):**
- Hooks must **never `RAISE`** — signal via messages/flags; the component wraps every hook call and turns a thrown exception into an `E` message, so the never-raises contract still holds.
- A **wrong-typed** `hooks` object (one that does not implement `ZIF_SSI_HOOKS`) **fails the import closed** — configured hooks are never silently skipped.
- **Coverage:** all five hooks run on the **generic engine** (flat active create) and the facade. A generated **deep/draft/upsert adapter** runs `coerce_field` / `on_before_persist` only when regenerated with a hook-aware `ZCL_SSI_ADAPTER_GEN` (`on_rows_parsed` / `on_message` / `on_completed` always run — they sit in the facade).

Full reference + a runnable example: the [public API contract](public-api-contract.md#extension-hooks-zif_ssi_hooks) and the [usage cookbook](usage-cookbook.md) (the runnable `ZCL_SSI_SAMPLE_HOOKS`).

## Backend processing model (important)

The engine calls `COMMIT ENTITIES`, which is illegal **inside** a RAP behavior handler. So it has two modes, selected by the `defer_commit` option:

- **Synchronous (default for the OData `importFile` action) — the frontend sends the file and waits; all data is imported in that one call.** The action runs the engine with `defer_commit = abap_true`: the engine does the `MODIFY ENTITIES` and lets the **RAP framework commit at the end of the OData request**. The frontend's single POST returns only after every row is imported, with the result (`Requested`/`Created`/`Failed` + per-row messages). ✅ proven. It's **one transaction → atomic**; per-row messages for interaction-phase issues (duplicate key, type, `mandatory:create`) come back in the result, while a save-phase `validation` failure rolls the whole request back and surfaces as the OData request error.
- **Asynchronous (for very large files)** — ships as a **separate optional package** (the demo/stream layer, *not* part of the core `ZSSI_IMPORTER` you installed in Step 1): it stores the file as a run (`status 'N'`, a `Content` `Edm.Stream`) and a background/application job calls `zcl_ssi_runner=>process_pending( )` to import it **chunked** in its own LUW while the UI polls the run. Use it when a single request/transaction would be too large; otherwise the synchronous path above or your own job (below) covers it.
- **Your own controller / job** — call `zcl_ssi_import=>import_file( … )` directly (default `defer_commit = false` → the engine owns `COMMIT`, chunked) from any non-handler class.

## Data rules to put in your end-user template / docs

These are real spreadsheet pitfalls, not component bugs:
- **Dates**: provide as text `YYYY-MM-DD` or `YYYYMMDD`. Native Excel date cells are unreliable to coerce (and can dump) — the template should format date columns as text.
- **Leading zeros** (material/part numbers, cost centers): Excel silently drops them from numeric-looking cells. Format key columns as **Text** in the template, or zeros are lost before the file ever reaches the backend.
- **Decimals**: rounded to the target field's scale; don't rely on more precision than the field has.
- **Formulas**: the importer reads the **last-saved cached value**; re-open/recalculate before upload if inputs changed.

## Troubleshooting (symptom → cause → fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| Upload "succeeds" but no data created | EML create silently no-op'd: missing `%control`/mandatory data, or wrong RAP phase | Component sets `%control` per field; check the returned `reported`/`%msg` (can be non-empty while `failed` is empty); ensure required data present |
| `RAP_RUNTIME 019` "transaction cannot be revived" dump | A prior chunk failed and the next EML ran without rollback | Component issues `ROLLBACK ENTITIES` after any failure and starts the next chunk in a fresh transaction |
| Opaque short dump on import | Lower-case `entity_name`/`sub_name` in the dynamic EML | Component upper-cases them; if you pass a BO/association name, give it uppercase |
| Your validations don't run | `IN LOCAL MODE` was used (bypasses validations/auth/prechecks) | Component calls EML **non-local** against your BO; don't enable a "local/privileged" mode unless you mean to |
| Determination loops / times out | Your determination issues `MODIFY` that re-triggers itself | Guard your determination (don't re-modify the trigger field set); not a component issue |
| Dates all blank / wrong | Native Excel date cells or wrong format | Use text dates in the template (see data rules) |
| Number-range error `BEHAVIOR_ILLEGAL_STATEMENT` | Your BO's custom number range does its own `COMMIT WORK` | Set the number-range object to **main-memory buffering** |
| Drafts not created (active rows appear instead) | Generic engine can't set `%is_draft` | Use the typed **adapter** for draft targets (step 2B) |
| Big file slow / memory | XCO holds the workbook in memory; one huge commit | Lower `rowThreshold`, tune chunk size; consider splitting the file |
| `COMMIT ENTITIES is not allowed with this status` dump | You called the engine from inside a RAP action/handler | The engine owns the commit — call it from your own job/controller (or set `defer_commit` so the framework commits at request end), or use the async runner from the separate demo/stream package; the upload action must only *store* the file |
| Drafts created as active rows | No adapter registered for the BO | Generate + register a draft adapter (Step 2B) — the generic engine is active-only |
| Upload "succeeds", run row has empty fields | A typed `CREATE FROM` without `%control` | Use `CREATE FIELDS ( … ) WITH` (auto-sets control); the shipped handler/`fill_line` already do |

## Options (recent)
- **`IsCsv` is optional** — the format is auto-detected from the file's magic bytes (xlsx ZIP vs text). Only set `IsCsv = true` to force the CSV branch for the rare CSV that begins with the bytes `PK`.
- **`header_row`** — set when the column headers aren't on row 1 (title/metadata rows above are skipped). Applies to XLSX and CSV.
- **Per-row results carry `severity` + `field`** — each message now reports its real severity (`E`/`W`/`I`/`S`) and the offending element where the BO supplies one.
- **Key fields are ALPHA-converted** automatically (e.g. material/cost-center/document numbers get their leading zeros); NUMC fields are zero-padded and non-numeric input is rejected per row.
- **`mode` (create / update / upsert)** — `create` (default) inserts; `update` changes existing rows by key; `upsert` does both (create the missing rows, update the existing ones). update/upsert require a **generated upsert adapter** (step 2B) and are rejected fail-closed by the generic engine and the create-only adapters. Created rows correlate back to the sheet by `%cid`, updated rows by key; the result carries **separate `created` and `updated`** counts (`failed = requested − created − updated`).

## Limits (current)
- **UPDATE / UPSERT** — shipped via a **generated upsert adapter** (`generate_upsert`, step 2B): set `ts_options-mode` to `update` or `upsert`; the adapter existence-READs the keys, then CREATEs the missing rows and UPDATEs the existing ones (**partial** — only the columns present in the sheet change). The **generic engine stays create-only**. On **S/4HANA 2023** the typed `TABLE FOR UPDATE` cannot be RTTC-built, so update/upsert go through the generated adapter; on **2025 / ABAP Cloud** the generic path could do it via `GET_BDEF_DERIVED_TYPE`. v1 covers a **single-field key**; multi-field keys and deep/composition upsert are not yet emitted. See internals §19.
- **CURR / QUAN decimal-shift not applied** — amounts/quantities are stored as parsed; supply already-internal values or let the target BO do the currency/unit shift. ALPHA (key fields) **is** applied; lexical-MATNR / alternate ALPHA variants are not.
- **Draft, deep/compositions, complex control** → on **S/4HANA 2023** these need the typed adapter (step 2B); on **S/4 2025 / ABAP Cloud** the generic engine handles them too (it uses `CL_ABAP_TABLEDESCR=>GET_BDEF_DERIVED_TYPE`, which only exists on the newer release). So the *zero-code* reach depends on your backend release.
- **Large volumes** are committed in **chunks** (all-or-nothing per chunk). Proven: 2000 rows in ~2.6 s on a trial box. Tune chunk size; for very large loads the backend can parallelize (`CL_ABAP_PARALLEL` / bgPF).
- **XLSX + CSV** only (XCO is XLSX-only; CSV handled separately).
- Very large files bounded by ABAP memory (XCO in-memory); chunked commits mitigate but test at your volumes.
- Per-row UI messages depend on the component version (v1 may be coarser).
- **CREATE template download** — shipped (function import + `$value` stream; see "Server-side template download"). On **S/4HANA 2023** XCO writes **plain data only** — no dropdowns, locked cells or styling (newer-release XCO features); single flat root entity. On **S/4HANA 2025 / SAP_BASIS 816** XCO *can* style cells (verified live) — **styled headers + column widths** are planned as an optional, release-gated enhancement that degrades to the plain template on 758; see the 2025/816 styling research (maintainer docs).

## Upgrades & clean core
- The component is delivered under a **reserved namespace**; only one active version of a class exists per system, so follow the component's documented upgrade path (don't hand-patch).
- The component consumes only released (Clean-Core A) APIs and is ABAP-Cloud-ready and upgrade-stable. Its public surface *can* be **C1-released** for cross-software-component use on a Cloud/S/4HANA-Cloud/BTP-ABAP target (see "C1 API release" under the file-import notes); that release is not required for same-software-component consumption and is not assignable on plain on-prem 2023.

---
## Server-side file import — add an "upload & import" action to your BO

Let a user (Fiori) or a system (API) send a spreadsheet **file** to your RAP BO and
have its rows imported — with about two lines of your own code. The engine runs
parse → coerce → dynamic EML create with `defer_commit` (the RAP framework commits
at the end of the OData request, so it's one synchronous call).

### What the component ships for this (package `ZSSI_IMPORTER`)
| Object | Role |
|---|---|
| `ZSSI_A_IMPORT` | Flat action parameter (base64 `FileContent` + format options) — the **API** channel. |
| `ZSSI_A_IMPORT_FILE` | Deep action parameter (Fiori `largeObject` upload via `_File`) — the **Fiori** channel. |
| `ZSSI_A_FILE` | The uploaded file (`Edm.Stream` + mime + filename). |
| `ZSSI_A_RESULT` | `Requested` / `Created` / `Failed` / `Messages`. |
| `ZCL_SSI_IMPORT_ACTION=>execute( )` | The one-line handler delegate (generic — any BO's keys/result fit). |
| `ZCL_SSI_ADAPTER_GEN=>generate_action( )` | Emits the handler + the BDEF action lines for you. |

### Steps (consumer side)
1. **Two action lines** in your BO's behavior definition (the root entity's behavior):
   ```abap
   static action importExcel  parameter ZSSI_A_IMPORT       result [1] ZSSI_A_RESULT;
   static action importUpload  deep parameter ZSSI_A_IMPORT_FILE result [1] ZSSI_A_RESULT;
   ```
   Keep only `importExcel` for API-only, or only `importUpload` for Fiori-only.
2. **One handler method per action** in your behavior pool (Local Types / CCIMP) — generate it
   with `zcl_ssi_adapter_gen=>generate_action( iv_entity = 'ZXX_R_BO' iv_alias = 'YourAlias' )`,
   or write it by hand (each body is a single call):
   ```abap
   METHOD import_excel.   " FOR ACTION YourAlias~importExcel
     zcl_ssi_import_action=>execute( EXPORTING it_keys   = keys
                                               iv_entity = 'ZXX_R_BO'
                                     CHANGING  ct_result = result ).
   ENDMETHOD.
   ```
3. **Expose** your BO via an OData V4 UI service (SRVD + SRVB). `importExcel`/`importUpload`
   surface as bound collection actions.

### Calling it
- **API** — `POST .../YourEntity/<namespace>.importExcel` with
  `{ "FileContent":"<base64 of the xlsx/csv>", "IsCsv":true, "IsDraft":false, "ChunkSize":0, "DecimalSeparator":"", "HeaderRow":0 }`
  → `{ "Requested":n, "Created":n, "Failed":n, "Messages":"..." }`.
- **Fiori Elements** — `importUpload` renders a **file-upload control in the action-parameter
  dialog** (the `_File` largeObject); the user picks the file and the rows import.

### Option fields (on both parameters)
`IsCsv` force CSV (else magic-byte auto-detect) · `IsDraft` create drafts · `ChunkSize` rows/LUW
(0 = default 500) · `DecimalSeparator` `'.'`/`','` to disambiguate numbers · `HeaderRow` 1-based header row.

### Amounts & quantities (CURR / QUAN / DEC)
The cell→field coercion normalises real-world amount/quantity notations before parsing, so typical
finance/logistics exports import without pre-cleaning:
- **Thousands grouping** — `.` / `,`, plain space, and non-breaking space (`1 234 567,89`, `1.234,56`).
- **Currency symbol / ISO code / unit** — a leading/trailing `$ € £ … / USD / EUR / kg` is stripped
  (`$1,234.50`, `1.234,56 EUR`, `10,5 kg`).
- **Negatives** — leading/trailing sign and accounting parentheses (`-1.234,56`, `1.234,56-`, `(1.234,56)`).
- **Fail-closed** — a cell with no digit left after cleaning (`N/A`, a lone `-`) fails the row; it is
  never silently imported as `0`.

Set **`DecimalSeparator`** whenever cells carry a currency symbol or thousands grouping — without it the
"last of `.` / `,`" heuristic is used, which is ambiguous for single-separator grouped values
(`$1,234` → `1.234`, not `1234`). Values are stored to the target field's own DDIC decimals.
**Limits:** per-currency decimal shifts (JPY 0-dec, BHD 3-dec — the BAPICURR / CUKY convention) are
**not** applied; the importer writes the field's declared scale, so pass already-scaled amounts (or use
a 2025/Cloud currency-aware action if you need the shift). Scientific notation (`1.5E3`) is accepted only
for `FLOAT` / `DECFLOAT` targets, not packed `CURR` / `QUAN` / `DEC`.

### Notes & limits (S/4HANA 2023 on-prem)
- **Synchronous**: the one OData call returns after the rows are committed. `defer_commit` is set
  by the helper — never `COMMIT ENTITIES` in the handler.
- **Create by default; update/upsert** available by setting `ts_options-mode` + a generated upsert
  adapter (see "Limits" / internals §19). Rows with a conversion error are **failed closed** (never
  created with a defaulted field).
- **Fiori upload on 2023 on-prem — confirmed framework-version gap, not a modeling bug.**
  `ZSSI_A_FILE` is modelled *verbatim* per SAP's documented "File Upload as an Action Parameter"
  recipe ([Enabling Stream Support](https://ui5.sap.com/#/topic/b236d32d48b74304887b3dd5163548c1):
  `@Semantics.largeObject.mimeType/.fileName/.contentDispositionPreference:#INLINE` on
  `abap.rawstring`, `@UI.hidden` mime/filename). The live `$metadata` on 758 **does** render
  `FileContent` as `Edm.Stream` (so the upload control renders), **but** the RAP→OData V4 gateway
  does **not** translate `@Semantics.largeObject` into the `Core.MediaType` / `Core.ContentDisposition` /
  `Core.IsMediaType` / `Core.AcceptableMediaTypes` annotations that Fiori Elements needs to wire the
  mime-type filter and file name in the action dialog. Verified empirically: the 758 `$metadata`
  carries **zero** of those `Core.*` terms on the action-parameter ComplexType.
  - **No supported on-prem-758 workaround.** This translation is done by the gateway metadata
    generator on SAP BTP ABAP / S/4HANA Cloud (and newer on-prem gateway SPs — cf. note class
    `BC-ESI-ESF-GW`); it is *not* expressible via DDLX (metadata-extension scope doesn't cover an
    abstract action-parameter ComplexType — and is flagged unsupported on 7.5x), nor via a raw CDS
    `@Core.*` passthrough, nor a SRVD annotation. The only on-prem path is a gateway SP/note upgrade,
    not a code change.
  - **Forward-compatible by construction.** Because the modelling already matches SAP's recipe
    byte-for-byte, the dialog auto-wires mime/filename on Cloud / a newer on-prem gateway with **zero
    change** to this component.
  - **758 today:** the **base64 API channel** is the universal, fully-wired path; the Fiori channel
    still renders a working `Edm.Stream` upload (mime/filename just aren't auto-bound). The importer
    auto-detects the file type from magic bytes regardless, so the import works either way.
- **C1 API release (only for cross-software-component consumption).** The "use of non-released API"
  ATC finding only fires when a *restricted* (ABAP for Cloud Development) consumer references these
  objects **from a different software component**. Per the released-API rules, access **within the
  same software component is always allowed without release** — so for the common model (pull the
  abapGit repo into a package in the consumer's own software component, reference it there) **no C1
  release is needed**. Release matters only if you deliver the importer as a *separate* software
  component consumed across that boundary on a Cloud/2025 system.
  - When you do need it (Cloud target): in ADT open each object's **API State** editor → set the
    **C1 (Use system-internally)** contract to *Released*, visibility *Use in Cloud Development*
    (and/or *Use in Key User Apps*) → save. Release the consumer-referenced surface: the 4 abstract
    entities (`ZSSI_A_IMPORT`, `ZSSI_A_IMPORT_FILE`, `ZSSI_A_FILE`, `ZSSI_A_RESULT`) + the 2 abstract
    BDEFs (`ZSSI_A_FILE`, `ZSSI_A_IMPORT_FILE`), plus `ZCL_SSI_IMPORT_ACTION` / `ZIF_SSI_IMPORTER`
    if the consumer calls them directly.
  - **Releasing your *own* objects is a Cloud / S/4HANA Cloud / BTP ABAP-environment capability.** On
    a plain **on-prem S/4HANA 2023** system it is typically **not assignable** — verified on A4H:
    `API_STATE` reports `isAnyAssignmentPossible:false` system-wide (identical for the DDLS, the BDEF,
    and a normal class), so neither ADT nor any tool can set it there. It is also **not automatable**
    via arc-1 (the API-state interface is read-only). ATC `ABAP_CLOUD_DEVELOPMENT_DEFAULT` on these
    objects already returns 0 findings, so they are clean-core-ready regardless.

## Server-side template download — give users a CREATE template for your BO

Hand users a ready-to-fill `.xlsx` whose columns are **exactly the fields your importer accepts**, so a
filled-in file re-imports with no mapping. Generated on the fly with XCO (nothing is stored); proven on
S/4HANA 2023 (SAP_BASIS 758).

### What the component ships (package `ZSSI_IMPORTER`)
| Object | Role |
|---|---|
| `ZCL_SSI_TEMPLATE` | The generator: `build_create_template( iv_entity, iv_sample_rows, it_mapping ) RETURNING xstring`. |
| `ZSSI_A_TEMPLATE` | Function **parameter** (`EntityName`, `SampleRows`). |
| `ZSSI_A_TFILE` | Function **result** (`FileContent` rawstring → base64, `MimeType`, `FileName`). |
| `ZCL_SSI_TEMPLATE_ACTION` | One-line **function**-handler delegate (mirror of `ZCL_SSI_IMPORT_ACTION`). |
| `ZSSI_C_TEMPLATE` + `ZCL_SSI_TEMPLATE_QUERY` | Custom entity + unmanaged query for the **`$value` download stream**. |
| `ZCL_SSI_ADAPTER_GEN=>generate_template_function( )` | Emits the BDEF line + handler for you. |

The header row matches the UI5 SpreadsheetUpload component's downloaded-template format 1:1 — the field
label, a space, then the technical name in brackets (`Order ID [OrderId]`); a field with **no** label repeats
the property name (`OrderId [OrderId]`). The field set is the *same* the importer accepts (both come from
`zcl_ssi_util=>importable_fields`), followed by `SampleRows` example rows (default 1). Cells are written as
**text** so leading zeros survive and dates don't dump on re-import. (On 758 the bracketed name is UPPER CASE,
e.g. `ORDERID [ORDERID]`, because XCO can read only the active, upper-cased element name there — see round-trip below.)

### Two channels — pick one or both

**A) Function import (programmatic / API).** Add one function line + a one-line handler (generate both with
`zcl_ssi_adapter_gen=>generate_template_function( iv_entity = 'ZXX_R_BO' iv_alias = 'YourAlias' )`):
```abap
" in the BDEF (root entity behavior):
static function getCreateTemplate parameter ZSSI_A_TEMPLATE result [1] ZSSI_A_TFILE;

" in the behavior pool (Local Types / CCIMP):
METHOD get_create_template.   " FOR READ ... FOR FUNCTION YourAlias~getCreateTemplate
  zcl_ssi_template_action=>execute( EXPORTING it_keys = keys iv_entity = 'ZXX_R_BO' CHANGING ct_result = result ).
ENDMETHOD.
```
Call it: `GET .../YourEntity/<namespace>.getCreateTemplate(EntityName='ZXX_R_BO',SampleRows=1)`
→ `{ "FileContent":"<base64 xlsx>", "MimeType":"…sheet", "FileName":"ZXX_R_BO_template.xlsx" }`. The client
base64-decodes `FileContent` and saves it. **Use the dedicated result entity `ZSSI_A_TFILE`, not
`ZSSI_A_FILE`** — reusing the upload entity makes `$metadata` fail 500 with *"Complex type … already exists"*.

**B) `$value` media stream (one-click browser download).** Expose the shipped custom entity in your service
definition (`expose ZSSI_C_TEMPLATE as Template;`) and GET the largeObject:
```
GET .../Template(EntityName='ZXX_R_BO')/FileContent
```
On 758 this returns the bytes with `content-disposition: attachment; filename="ZXX_R_BO_template.xlsx"`
(verified) — the browser downloads the file directly, no JS. (The 758 largeObject-`$metadata` gap noted
for the *upload* control does **not** affect this download path.)

### Round-trip with the UI5 Spreadsheet Importer component
Both directions interoperate, by construction:
- **Component template → server import.** The component's `downloadTemplate` emits `Label [Property]` headers
  (its default `labelTypeBrackets`). `ZCL_SSI_PARSER.resolve_field` **strips a trailing `[Technical]` bracket**
  to the field name, so a component-downloaded template re-imports zero-config (an explicit `mapping` still
  overrides).
- **Backend template → component import.** The backend emits the **same** `Label [Property]` shape, but on 758
  the bracket is UPPER CASE (`ORDERID`) because XCO exposes only the active, upper-cased element name there. The
  component (≥ v2.4.x with `Util.columnMatchesType`) matches the bracketed token **case-insensitively**, so the
  backend's upper-case template re-imports through the component unchanged. Server-side import was always
  case-insensitive (`resolve_field` upper-cases). For columns guaranteed to reflect *createable* fields (not the
  OData projection), prefer the backend **function/stream** above over generating client-side.

### Limits & release-dependent capabilities
- **758 (S/4HANA 2023): plain data only.** Styling (bold/fill/font colour), dropdowns (data validation) and
  locked cells (sheet protection) are **not in XCO on 758** — they need a newer release. Ship a curated styled
  `.xlsx` as the component's `spreadsheetTemplateFile` if you need those on 758 today.
- **816 (S/4HANA 2025) adds styling** — verified live: bold/fill/font-colour, alignment and column widths exist
  and are **Released (Clean-Core A)**. The plan is an **optional, release-gated** enhancement — **styled header
  + column widths on 816+/Cloud, plain template on 758** (the floor stays 2023, zero regression). Dropdowns and
  sheet protection are also present on 816 but **intentionally out of scope**. Details + the 758↔816 matrix:
  the 2025/816 styling research (maintainer docs).
- **Sample cells stay TEXT on every release** — even 816 has no XCO number/date *display-format* API, so typed
  display isn't possible; text also keeps leading zeros and avoids the native-Excel-date dump.
- **Single flat root entity.** Deep/composition (multi-sheet) templates and per-currency decimal columns
  are out of scope for v1.
