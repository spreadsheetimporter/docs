# Fiori Elements & file upload

Let a user (Fiori) or a system (API) send a spreadsheet **file** to your RAP BO and have its rows
imported — with about two lines of your own code. The action runs parse → coerce → dynamic EML create
with `defer_commit` (the RAP framework commits at the end of the OData request, so it's one synchronous
call).

## What the component ships

| Object | Role |
|---|---|
| `ZSSI_A_IMPORT` | Flat action parameter (base64 `FileContent` + format options) — the **API** channel. |
| `ZSSI_A_IMPORT_FILE` | Deep action parameter (Fiori `largeObject` upload via `_File`) — the **Fiori** channel. |
| `ZSSI_A_FILE` | The uploaded file (`Edm.Stream` + mime + filename). |
| `ZSSI_A_RESULT` | `Requested` / `Created` / `Failed` / `Messages`. |
| `ZCL_SSI_IMPORT_ACTION=>execute( )` | The one‑line handler delegate (generic — any BO's keys/result fit). |
| `ZCL_SSI_ADAPTER_GEN=>generate_action( )` | Emits the handler + the BDEF action lines for you. |

## Wire it into your BO (3 steps)

1. **Two action lines** in your BO's behavior definition (the root entity's behavior):

    ```abap
    static action importExcel  parameter ZSSI_A_IMPORT            result [1] ZSSI_A_RESULT;
    static action importUpload deep parameter ZSSI_A_IMPORT_FILE  result [1] ZSSI_A_RESULT;
    ```
    Keep only `importExcel` for API‑only, or only `importUpload` for Fiori‑only.

2. **One handler method per action** in your behavior pool — generate it with
   `zcl_ssi_adapter_gen=>generate_action( iv_entity = 'ZXX_R_BO' iv_alias = 'YourAlias' )`, or write it
   by hand (each body is a single call):

    ```abap
    METHOD import_excel.   " FOR ACTION YourAlias~importExcel
      zcl_ssi_import_action=>execute( EXPORTING it_keys   = keys
                                                iv_entity = 'ZXX_R_BO'
                                      CHANGING  ct_result = result ).
    ENDMETHOD.
    ```
    (Pass an optional `is_options` to inject [extension hooks](extension-hooks.md) or a mapping.)

3. **Expose** your BO via an OData V4 UI service (SRVD + SRVB). `importExcel` / `importUpload` surface
   as bound actions.

## Calling it

=== "API (any client)"

    ```http
    POST .../YourEntity/<namespace>.importExcel
    { "FileContent":"<base64 of the xlsx/csv>", "IsCsv":true, "IsDraft":false,
      "ChunkSize":0, "DecimalSeparator":"", "HeaderRow":0 }
    ```
    → `{ "Requested":n, "Created":n, "Failed":n, "Messages":"..." }`

=== "Fiori Elements"

    `importUpload` renders a **file‑upload control in the action‑parameter dialog** (the `_File`
    largeObject); the user picks the file and the rows import. The action is surfaced on the list
    report / object page through a **metadata extension** (see below).

    !!! note "Frontend requirement: SAPUI5 ≥ 1.135"
        File upload as an action parameter is a Fiori Elements (OData V4) feature **added in
        SAPUI5 1.135** (April 2025). Older UI5 versions render the `FileContent` parameter as a
        plain field. Backend requirement: see the release matrix below.

**Option fields** (on both parameters): `IsCsv` force CSV (else magic‑byte auto‑detect) · `IsDraft`
create drafts · `ChunkSize` rows/LUW (0 = default 500) · `DecimalSeparator` `'.'`/`','` · `HeaderRow`
1‑based header row. See [Options & data types](options.md).

## Surfacing the action in Fiori Elements (metadata extension)

In a Fiori Elements app the import action becomes a **button in the table toolbar** via a CDS
**metadata extension** (DDLX) on your projection view — no custom UI code. This is the (verified,
runnable) annotation from the samples' demo BO:

```abap
@Metadata.layer: #CORE
@UI: {
  headerInfo: { typeName: 'Demo Order', typeNamePlural: 'Demo Orders',
                title: { type: #STANDARD, value: 'OrderId' } }
}
annotate view ZSSI_C_S_ORD with
{
  // the #FOR_ACTION line items put the import buttons in the table toolbar
  @UI: { lineItem:       [ { position: 10, importance: #HIGH },
                           { type: #FOR_ACTION, dataAction: 'importUpload', label: 'Import Spreadsheet (File Upload)' },
                           { type: #FOR_ACTION, dataAction: 'importExcel',  label: 'Import Spreadsheet (Base64)' } ],
         identification: [ { position: 10 },
                           { type: #FOR_ACTION, dataAction: 'importUpload', label: 'Import Spreadsheet (File Upload)' } ],
         selectionField: [ { position: 10 } ] }
  OrderId;

  @UI: { lineItem: [ { position: 20 } ], identification: [ { position: 20 } ] }
  Customer;
}
```

The full stack around it: projection view (`@Metadata.allowExtensions: true`, provider contract
`transactional_query`) → behavior projection (`use action importExcel; use action importUpload;
use function getCreateTemplate;`) → service definition → OData V4 UI service binding.

!!! info "A complete, runnable example is in the samples"
    The [samples repo](https://github.com/spreadsheetimporter/abap-spreadsheetimporter-samples) ships the
    whole thing — the wired demo BO (`ZSSI_R_S_ORD` + one‑line handlers), the projection stack with the
    DDLX above, the published OData V4 service, **and a runnable Fiori Elements app**
    (`app/demo-orders`) on top of it, including a custom "API channel" action
    (`webapp/ext/ImportSpreadsheet.js`: file picker → base64 → `importExcel`) that works on every
    supported release.

## Which channel works where (verified)

| | S/4HANA 2023 on‑prem (758) | BTP ABAP / S/4HANA Cloud (newer gateway) |
|---|---|---|
| **Native `importUpload` dialog** (needs SAPUI5 ≥ 1.135) | dialog **renders** — file‑upload control + the shipped field labels — but **submit fails**: the gateway cannot deserialize an inline `Edm.Stream` action parameter (`Parser error … while parsing an XML stream`) | ✅ works zero‑code (gateway emits the `Core.*` terms and accepts the stream payload) |
| **Base64 `importExcel`** — via API or an FE **custom action** | ✅ **works end‑to‑end** — verified live: per‑row BO messages (e.g. *"key value already in use"*) surface in the FE result dialog | ✅ works |

So on 758 build the upload button as a small FE **custom action** that base64‑encodes the picked file
and calls `importExcel` (the sample's
[`ImportSpreadsheet.js`](https://github.com/spreadsheetimporter/abap-spreadsheetimporter-samples/blob/main/app/demo-orders/webapp/ext/ImportSpreadsheet.js)
is exactly that, ~60 lines). Keep `importUpload` modeled — it lights up with zero change once the
backend moves to a gateway that supports it.

## The 758 on‑prem gateway gap (detail)

On **S/4HANA 2023 on‑prem**, the base64 **API channel is the universal, fully‑wired path**. The native
Fiori upload is blocked by the gateway in two ways — both **framework‑version gaps, not modelling
bugs** (verified empirically against a live 758 system, from curl *and* from a real FE 1.136 app):

1. `$metadata` carries **none** of the `Core.MediaType` / `Core.ContentDisposition` /
   `Core.AcceptableMediaTypes` terms Fiori Elements uses to wire the mime filter and file name
   (the `@EndUserText.label`s *do* arrive — the dialog fields are nicely labeled).
2. The action `POST` itself is rejected: the 758 gateway cannot deserialize an inline stream value in
   the JSON action payload, in any representation (with/without `@odata.mediaContentType`, base64 or
   base64url, OData 4.0 or 4.01 headers).

??? note "Why (the gateway detail)"
    `ZSSI_A_FILE` is modelled *verbatim* per SAP's documented "File Upload as an Action Parameter" recipe
    (`@Semantics.largeObject.mimeType/.fileName/.contentDispositionPreference:#INLINE` on `abap.rawstring`,
    `@UI.hidden` on mime/filename, `acceptableMimeTypes`). The live `$metadata` on 758 **does** render
    `FileContent` as `Edm.Stream` (which is why the 1.135+ dialog shows the upload control), **but** the
    RAP→OData V4 gateway does **not** translate `@Semantics.largeObject` into the `Core.*` terms, and its
    JSON deserializer predates inline stream values in action payloads.

    Neither half is expressible via DDLX, a raw `@Core.*` passthrough, or a SRVD annotation — the only
    on‑prem path is a gateway SP/note upgrade. Because the modelling already matches SAP's recipe
    byte‑for‑byte, the dialog **auto‑wires on Cloud / a newer on‑prem gateway with zero change** to this
    component.

??? note "C1 API release (only for cross‑software‑component consumption on Cloud)"
    The "use of non‑released API" ATC finding only fires when a *restricted* (ABAP for Cloud Development)
    consumer references these objects **from a different software component**. Within the same software
    component, access is always allowed without release — so for the common model (pull the repo into a
    package in your own software component) **no C1 release is needed**. If you do deliver the importer as a
    *separate* software component on a Cloud/2025 target, release the consumer‑referenced surface (the 4
    abstract entities `ZSSI_A_IMPORT` / `ZSSI_A_IMPORT_FILE` / `ZSSI_A_FILE` / `ZSSI_A_RESULT`, the 2 abstract
    BDEFs, and `ZCL_SSI_IMPORT_ACTION` / `ZIF_SSI_IMPORTER` if called directly) via each object's **API State**
    editor → C1 *Released*, *Use in Cloud Development*. (Releasing your own objects is a Cloud capability;
    on plain on‑prem 2023 it is not assignable, and ATC already returns 0 findings there.)
