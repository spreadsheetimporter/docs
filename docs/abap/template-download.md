# Template download

Hand users a ready‑to‑fill `.xlsx` whose columns are **exactly the fields your importer accepts**, so a
filled‑in file re‑imports with no mapping. Generated on the fly with XCO (nothing is stored); proven on
S/4HANA 2023 (SAP_BASIS 758).

## What the component ships

| Object | Role |
|---|---|
| `ZCL_SSI_TEMPLATE` | The generator: `build_create_template( iv_entity, iv_sample_rows, it_mapping ) RETURNING xstring`. |
| `ZSSI_A_TEMPLATE` | Function **parameter** (`EntityName`, `SampleRows`). |
| `ZSSI_A_TFILE` | Function **result** (`FileContent` rawstring → base64, `MimeType`, `FileName`). |
| `ZCL_SSI_TEMPLATE_ACTION` | One‑line **function**‑handler delegate (mirror of `ZCL_SSI_IMPORT_ACTION`). |
| `ZSSI_C_TEMPLATE` + `ZCL_SSI_TEMPLATE_QUERY` | Custom entity + unmanaged query for the **`$value` download stream**. |
| `ZCL_SSI_ADAPTER_GEN=>generate_template_function( )` | Emits the BDEF line + handler for you. |

The header row matches the UI5 Spreadsheet Importer's downloaded‑template format 1:1 — the field label, a
space, then the technical name in brackets (`Order ID [OrderId]`); a field with **no** label repeats the
property name (`OrderId [OrderId]`). The field set is the *same* the importer accepts (both come from
`zcl_ssi_util=>importable_fields`), followed by `SampleRows` example rows (default 1). Cells are written
as **text** so leading zeros survive and dates don't dump on re‑import.

!!! note "Header case on 758"
    On S/4HANA 2023 the bracketed name is UPPER CASE (`ORDERID [ORDERID]`) because XCO can read only the
    active, upper‑cased element name there. Re‑import is case‑insensitive, so this round‑trips fine.

## Two channels — pick one or both

=== "A. Function import (programmatic / API)"

    Add one function line + a one‑line handler (generate both with
    `zcl_ssi_adapter_gen=>generate_template_function( iv_entity = 'ZXX_R_BO' iv_alias = 'YourAlias' )`):

    ```abap
    " in the BDEF (root entity behavior):
    static function getCreateTemplate parameter ZSSI_A_TEMPLATE result [1] ZSSI_A_TFILE;

    " in the behavior pool (Local Types / CCIMP):
    METHOD get_create_template.   " FOR READ ... FOR FUNCTION YourAlias~getCreateTemplate
      zcl_ssi_template_action=>execute( EXPORTING it_keys = keys iv_entity = 'ZXX_R_BO' CHANGING ct_result = result ).
    ENDMETHOD.
    ```

    Call it:
    `GET .../YourEntity/<namespace>.getCreateTemplate(EntityName='ZXX_R_BO',SampleRows=1)`
    → `{ "FileContent":"<base64 xlsx>", "MimeType":"…sheet", "FileName":"ZXX_R_BO_template.xlsx" }`.
    The client base64‑decodes `FileContent` and saves it.

    !!! warning "Use the dedicated result entity `ZSSI_A_TFILE`"
        Reusing the upload entity `ZSSI_A_FILE` here makes `$metadata` fail 500 with
        *"Complex type … already exists"*.

=== "B. `$value` media stream (one‑click browser download)"

    Expose the shipped custom entity in your service definition (`expose ZSSI_C_TEMPLATE as Template;`)
    and GET the largeObject:

    ```
    GET .../Template(EntityName='ZXX_R_BO')/FileContent
    ```

    On 758 this returns the bytes with `content-disposition: attachment; filename="ZXX_R_BO_template.xlsx"`
    (verified) — the browser downloads the file directly, no JS. (The 758 largeObject `$metadata` gap noted
    for the *upload* control does **not** affect this download path.)

## Round‑trip with the UI5 Spreadsheet Importer

Both directions interoperate by construction:

- **Component template → server import.** The component's `downloadTemplate` emits `Label [Property]`
  headers (its default `labelTypeBrackets`). `ZCL_SSI_PARSER.resolve_field` strips a trailing
  `[Technical]` bracket to the field name, so a component‑downloaded template re‑imports zero‑config (an
  explicit `mapping` still overrides).
- **Backend template → component import.** The backend emits the **same** `Label [Property]` shape (upper
  case on 758). The component (≥ v2.4.x) matches the bracketed token case‑insensitively, so it re‑imports
  unchanged.

## Limits & release‑dependent capabilities

- **758 (S/4HANA 2023): plain data only.** Styling (bold/fill/font colour), dropdowns (data validation)
  and locked cells (sheet protection) are **not in XCO on 758**. Ship a curated styled `.xlsx` as the
  component's `spreadsheetTemplateFile` if you need those on 758 today.
- **816 (S/4HANA 2025) adds styling** (bold/fill/font‑colour, alignment, column widths — Released,
  Clean‑Core A). Planned as an **optional, release‑gated** enhancement (styled header + column widths on
  816+/Cloud, plain template on 758). Dropdowns and sheet protection are intentionally out of scope.
- **Sample cells stay TEXT on every release** — even 816 has no XCO number/date display‑format API; text
  also keeps leading zeros and avoids the native‑Excel‑date dump.
- **Single flat root entity.** Deep/composition (multi‑sheet) templates are out of scope for v1.
