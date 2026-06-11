# Usage cookbook — ZSSI_IMPORTER public API

A snippet + expected result for every public API, mirrored from the runnable
`ZCL_SSI_SAMPLES` (so each one is proven by an ABAP Unit test). The
classification of what's public vs internal is the library's
[public API contract](public-api-contract.md).

> **Pre‑1.0:** these signatures may change in any `0.x` release. Pin to a tag.

---

## `ZCL_SSI_IMPORT` — the facade (simplest entry point)

The facade **never raises**; every outcome is in `rs_result` (`requested` / `created` / `failed` / `keys`
/ `messages`). Use `import_file` for raw bytes (xlsx/CSV auto‑detected) or `import_rows` for rows you
already parsed.

```abap
" From already-parsed rows:
DATA lt_rows TYPE zif_ssi_types=>tt_row.
lt_rows = VALUE #(
  ( row_no = 1 cells = VALUE #( ( field = 'ORDERID' value = '9001' )
                                ( field = 'CUSTOMER' value = 'Demo AG' )
                                ( field = 'TOTALAMOUNT' value = '1234.50' ) ) ) ).
DATA(ls_result) = zcl_ssi_import=>import_rows(
  it_rows    = lt_rows
  is_options = VALUE #( entity_name = 'ZSSI_R_S_ORD' defer_commit = abap_true ) ).
" ls_result-created = 1   (defer_commit -> caller owns the COMMIT)

" From raw file bytes:
DATA(ls_result2) = zcl_ssi_import=>import_file(
  iv_content = lv_xstring                      " .xlsx or .csv bytes
  is_options = VALUE #( entity_name = 'ZSSI_R_S_ORD' ) ).
```

## `ZCL_SSI_PARSER` — standalone parsing utilities

```abap
" parse_csv: ; / , auto-detected; header row maps columns to BO fields.
DATA(lt_rows) = zcl_ssi_parser=>parse_csv(
  iv_content = |OrderId;Customer;TotalAmount\n1001;ACME;1499.90\n| ).
" lt_rows has 1 data row, cells ORDERID/CUSTOMER/TOTALAMOUNT

" parse_xlsx: same shape from .xlsx bytes. Raises zcx_ssi_parse on a corrupt file.
" DATA(lt_rows2) = zcl_ssi_parser=>parse_xlsx( iv_content = lv_xlsx_bytes ).

" coerce: external string -> typed value. iv_decimal_sep makes it deterministic.
DATA lv_amount TYPE decfloat34.
zcl_ssi_parser=>coerce(
  EXPORTING iv_raw = '1.499,90' iv_kind = cl_abap_typedescr=>typekind_decfloat34 iv_decimal_sep = ','
  IMPORTING ev_ok  = DATA(lv_ok)
  CHANGING  cv_target = lv_amount ).
" lv_amount = 1499.90 , lv_ok = abap_true
```

## `ZCL_SSI_TEMPLATE` — generate a CREATE template

```abap
" .xlsx whose header row = the importer's accepted fields, so the filled file
" re-imports with zero config. Raises cx_static_check for an unknown entity.
DATA(lv_xlsx) = zcl_ssi_template=>build_create_template(
  iv_entity = 'ZSSI_R_S_ORD' iv_sample_rows = 1 ).
" xstrlen( lv_xlsx ) > 0  -> a valid .xlsx
```

## `ZCL_SSI_ADAPTER_GEN` — emit a typed adapter for a BO

Run a generator, paste the emitted source into **your** package, then register it (below). Generators are
guarded against token injection — a non‑identifier argument raises `zcx_ssi_generate`.

```abap
DATA(lt_src) = zcl_ssi_adapter_gen=>generate_flat(    " also: generate_deep / generate_upsert
  iv_class = 'ZCL_MY_ORDER_ADAPTER' iv_root = 'ZSSI_R_S_ORD' iv_alias = 'Order' ).
" lt_src = the ABAP source of a ZIF_SSI_IMPORTER adapter

" generate_action / generate_template_function emit the one-line RAP handler + the
" BDEF lines to add (for the importExcel/importUpload action and getCreateTemplate function).
```

## `ZCL_SSI_FACTORY` — wire an adapter, or fall back to the engine

```abap
" Register your generated adapter for an entity:
zcl_ssi_factory=>register( iv_entity = 'ZSSI_R_S_ORD' iv_class = 'ZCL_MY_ORDER_ADAPTER' ).

" get_importer returns your adapter if registered, else the generic engine -- either way a
" bound importer you call through ZIF_SSI_IMPORTER (never the concrete class):
DATA(lo_importer) = zcl_ssi_factory=>get_importer( VALUE #( entity_name = 'ZSSI_R_S_ORD' ) ).
```

## RAP delegates — `ZCL_SSI_IMPORT_ACTION` / `ZCL_SSI_TEMPLATE_ACTION`

These turn a consumer's "upload a file → import" action and "download a template" function into **one
line** in the behavior pool. Add the action/function to your BDEF (the generators above emit the exact
lines), then:

```abap
" In your behavior pool (lhc_<alias>):
METHOD import_excel.    " FOR MODIFY ... FOR ACTION <Alias>~importExcel RESULT result
  zcl_ssi_import_action=>execute( EXPORTING it_keys    = keys
                                            iv_entity  = 'ZSSI_R_S_ORD'
                                            " optional: inject hooks / a mapping on the action path
                                            is_options = VALUE #( hooks = NEW zcl_ssi_sample_hooks( ) )
                                  CHANGING  ct_result  = result ).
ENDMETHOD.

METHOD get_create_template.   " FOR READ ... FOR FUNCTION <Alias>~getCreateTemplate RESULT result
  zcl_ssi_template_action=>execute( EXPORTING it_keys = keys iv_entity = 'ZSSI_R_S_ORD'
                                    CHANGING  ct_result = result ).
ENDMETHOD.
```

> This repo's demo BO `ZSSI_R_S_ORD` is intentionally **minimal** (a flat managed BO, no actions). Add the
> delegates to *your own* BO as shown above — the main project's full demo BO wires them end-to-end.

## `ZCL_SSI_IMPORTER_DOUBLE` — test double for `ZIF_SSI_IMPORTER`

Inject it in **your** unit tests where the real importer would go: preset the result, then assert on what
your code passed to `import( )`.

```abap
DATA(lo_double) = NEW zcl_ssi_importer_double( ).
lo_double->set_next_result( VALUE #( requested = 2 created = 2 ) ).
DATA(ls_result) = CAST zif_ssi_importer( lo_double )->import(
  it_rows = lt_rows is_options = VALUE #( entity_name = 'ZSSI_R_S_ORD' ) ).
" lo_double->get_call_count( ) = 1 ; get_last_rows( ) / get_last_options( ) = what you passed
```

## `ZIF_SSI_HOOKS` — developer extension hooks

Inject custom logic into the import pipeline without forking the library. Implement **only** the hooks you
need (each is `DEFAULT IGNORE`, so you can omit the rest) and pass your class via `ts_options-hooks`. Hooks
must **never raise** — signal via messages/flags; the library turns any thrown exception into an `E` message.

```abap
" A hooks class that drops blank rows, demotes a noisy BO warning, and logs the outcome.
CLASS zcl_my_hooks DEFINITION CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_ssi_hooks.        " implement a subset; the rest stay no-op (DEFAULT IGNORE)
ENDCLASS.

CLASS zcl_my_hooks IMPLEMENTATION.
  METHOD zif_ssi_hooks~on_rows_parsed.
    " drop rows whose CUSTOMER cell is blank (append an 'E' to ct_messages to abort instead)
    DATA lt_keep TYPE zif_ssi_types=>tt_row.
    LOOP AT ct_rows INTO DATA(ls_row).
      READ TABLE ls_row-cells WITH KEY field = 'CUSTOMER' INTO DATA(ls_c).
      IF sy-subrc = 0 AND ls_c-value IS NOT INITIAL.
        APPEND ls_row TO lt_keep.
      ENDIF.
    ENDLOOP.
    ct_rows = lt_keep.
  ENDMETHOD.

  METHOD zif_ssi_hooks~on_message.
    " demote a known tolerance warning to information
    IF cs_message-text CS 'price tolerance'.
      cs_message-severity = 'I'.
    ENDIF.
  ENDMETHOD.

  METHOD zif_ssi_hooks~on_completed.
    " ... write an audit log entry from is_result-created / is_result-failed ...
  ENDMETHOD.
  " coerce_field, on_before_persist not implemented -> no-op
ENDCLASS.
```
```abap
" inject it via ts_options-hooks:
DATA(ls_result) = zcl_ssi_import=>import_file(
  iv_content = lv_bytes
  is_options = VALUE #( entity_name = 'ZSSI_R_S_ORD' hooks = NEW zcl_my_hooks( ) ) ).
```

> The runnable copy ships in this repo: `ZCL_SSI_SAMPLE_HOOKS`
> injected by `ZCL_SSI_SAMPLES=>sample_hooks` — proven by the `hooks` unit test.

The five hooks: `on_rows_parsed` (validate/filter/abort), `coerce_field` (override a cell's conversion),
`on_before_persist` (mutate the payload), `on_message` (drop/reshape a message), `on_completed` (observe).
See the [contract](public-api-contract.md#extension-hooks-zif_ssi_hooks)
for the coverage notes (engine vs. generated adapter).

## Exceptions — `ZCX_SSI` / `ZCX_SSI_PARSE` / `ZCX_SSI_GENERATE`

The facade never raises, but the lower‑level parser and generators do. Catch `zcx_ssi` to handle any
library error in one place:

```abap
TRY.
    DATA(lt_rows) = zcl_ssi_parser=>parse_xlsx( iv_content = lv_bytes ).
  CATCH zcx_ssi_parse INTO DATA(lx_parse).      " corrupt / unreadable file
    " lx_parse->previous = the original framework error
  CATCH zcx_ssi INTO DATA(lx_any).              " any library error
ENDTRY.
```
