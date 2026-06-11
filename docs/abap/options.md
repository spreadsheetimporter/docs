# Options & data types

Every entry point takes `is_options TYPE zif_ssi_types=>ts_options`. This page lists all option
fields, the spreadsheet data rules to put in front of your users, and how amounts/quantities are
parsed.

## `ts_options` — the full field set

| Field | Type | Meaning | Default |
|---|---|---|---|
| `entity_name` | `string` | Target RAP BO **root entity** (upper-cased internally). **Required.** | — |
| `mode` | `string` | `create` / `update` / `upsert`. `update` and `upsert` need a generated upsert adapter. | `create` |
| `is_draft` | `abap_bool` | Create drafts instead of active rows — needs a generated draft adapter. | `abap_false` |
| `chunk_size` | `i` | Rows per LUW/commit (`0` → default 500). All‑or‑nothing per chunk. Ignored under `defer_commit`. | `0` |
| `header_row` | `i` | 1‑based row holding the column headers (rows above it are skipped). | `1` |
| `decimal_separator` | `c` | `'.'` or `','` to disambiguate grouped numbers; otherwise a "last separator" heuristic. | (heuristic) |
| `mapping` | `tt_map` | Optional header→field overrides; a `Label [TECHNICAL]` bracket already round‑trips zero‑config. | (empty) |
| `defer_commit` | `abap_bool` | `abap_true` = the engine only does `MODIFY ENTITIES` and the RAP framework commits at request end (use inside an action handler). `abap_false` = the engine owns `COMMIT` (call from your own job). | `abap_false` |
| `hooks` | `REF TO object` | An optional `ZIF_SSI_HOOKS` instance — see [Extension hooks](extension-hooks.md). | (none) |

!!! note "On the OData action/function"
    The action parameters `IsCsv`, `IsDraft`, `ChunkSize`, `DecimalSeparator`, `HeaderRow` map onto
    these fields. To inject `hooks` or a `mapping` on the action path, pass them through the helper's
    optional `is_options` — see [Extension hooks](extension-hooks.md).

## Spreadsheet data rules (put these in your end‑user template)

These are real spreadsheet pitfalls, not component bugs:

| Topic | Rule |
|---|---|
| **Dates** | Provide as **text** `YYYY-MM-DD` or `YYYYMMDD`. Native Excel date cells are unreliable to coerce (and can dump). |
| **Leading zeros** (material/part numbers, cost centers) | Format key columns as **Text** — Excel silently drops leading zeros from numeric‑looking cells *before* the file ever reaches the backend. |
| **Decimals** | Values are rounded to the target field's DDIC scale; don't rely on more precision than the field has. |
| **Formulas** | The importer reads the **last‑saved cached value** — re‑open/recalculate before upload if inputs changed. |

## Amounts & quantities (CURR / QUAN / DEC)

The cell→field coercion normalises common real‑world amount/quantity notations before parsing, so
typical finance/logistics exports import without pre‑cleaning:

| Notation | Examples | Handling |
|---|---|---|
| **Thousands grouping** — `.` / `,`, plain space, non‑breaking space | `1 234 567,89` · `1.234,56` | grouping stripped |
| **Currency symbol / ISO code / unit** — leading or trailing | `$1,234.50` · `1.234,56 EUR` · `10,5 kg` | symbol/code/unit stripped |
| **Negatives** — leading/trailing sign, accounting parentheses | `-1.234,56` · `1.234,56-` · `(1.234,56)` | parsed as negative |
| **No digit left after cleaning** | `N/A` · a lone `-` | **row fails (fail‑closed)** — never imported as `0` |

!!! tip "Set `decimal_separator` for grouped or currency values"
    Pass `decimal_separator = '.'` or `','` whenever cells carry a currency symbol or thousands
    grouping. Without it the "last of `.` / `,`" heuristic is used, which is **ambiguous** for
    single‑separator grouped values (`$1,234` → `1.234`, not `1234`). Values are stored to the target
    field's own DDIC decimals.

!!! warning "Limits"
    - **Per‑currency decimal shifts** (JPY 0‑dec, BHD 3‑dec — the BAPICURR / CUKY convention) are **not**
      applied; the importer writes the field's declared scale. Pass already‑scaled amounts (or use a
      2025/Cloud currency‑aware action if you need the shift).
    - **Scientific notation** (`1.5E3`) is accepted only for `FLOAT` / `DECFLOAT` targets, not packed
      `CURR` / `QUAN` / `DEC`.
    - **Key fields are ALPHA‑converted** automatically (leading zeros restored); **NUMC** fields are
      zero‑padded and non‑numeric input is rejected per row. Lexical‑MATNR / alternate ALPHA variants
      are not applied.
