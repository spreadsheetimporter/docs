# Extension hooks (`ZIF_SSI_HOOKS`)

Inject your own logic into the import pipeline **without forking** the component. Implement the one
shipped interface `ZIF_SSI_HOOKS` — every method is `DEFAULT IGNORE`, so you write **only** the hooks
you need and the rest stay runtime no‑ops — and pass an instance via `ts_options-hooks`.

| Hook | When | What you can do |
|---|---|---|
| `on_rows_parsed` | after parse, before import | validate / transform / **filter** the parsed rows; append an `E` message to **abort** the whole request |
| `coerce_field` | per cell, before the default conversion | **override** how one cell is converted to the target type |
| `on_before_persist` | before each `MODIFY ENTITIES` chunk | **mutate the payload in place** (e.g. stamp defaults) — don't add/remove rows or change `%cid`s |
| `on_message` | per result message | **drop** or **reshape** (text / severity / field) a message |
| `on_completed` | once, after the import | **observe** the final result (audit log, follow‑on processing) |

## Implement a subset, inject via `ts_options-hooks`

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

On the **one‑line RAP action** path, inject hooks via the helper's optional `is_options`:

```abap
METHOD import_excel.   " FOR ACTION YourAlias~importExcel
  zcl_ssi_import_action=>execute( EXPORTING it_keys    = keys
                                            iv_entity  = 'ZXX_R_BO'
                                            is_options = VALUE #( hooks = NEW zcl_my_hooks( ) )
                                  CHANGING  ct_result  = result ).
ENDMETHOD.
```

## Rules (the facade never raises)

- Hooks must **never `RAISE`** — signal via messages/flags. The component wraps every hook call and
  turns a thrown exception into an `E` message, so the never‑raises contract still holds.
- A **wrong‑typed** `hooks` object (one that does not implement `ZIF_SSI_HOOKS`) **fails the import
  closed** — configured hooks are never silently skipped.
- **Coverage:** the **generic engine** runs `coerce_field` / `on_before_persist` only; `on_rows_parsed`
  / `on_message` / `on_completed` run in the **facade** (`zcl_ssi_import`) — so a direct
  `get_importer->import` call gets only the two engine hooks. **No** generated adapter — flat, deep, or
  upsert — runs `coerce_field` / `on_before_persist` today; that would require regenerating with a
  hook‑aware `ZCL_SSI_ADAPTER_GEN`.

Full reference + a runnable example: the
[public API contract](public-api-contract.md#extension-hooks-zif_ssi_hooks) and the
[usage cookbook](usage-cookbook.md) (the runnable `ZCL_SSI_SAMPLE_HOOKS`).
