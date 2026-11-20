# Public API Contract & Stability

> **⚠️ Early version — experimental (`0.x`). Read this first.** This component is at an **early,
> experimental stage** and has **not cut a stable release yet** (see the CHANGELOG). Per
> [SemVer §4](https://semver.org/#spec-item-4), **anything in this
> document may change in any `0.x` release** — signatures, types, even what counts as public. The
> classification below is the contract we *intend* to freeze at `1.0`; until then it is "what we plan to
> keep stable," not a guarantee. **As a consumer today:** still follow the public-vs-internal split (bind
> to public, never to internal or generated classes), but **pin to a git tag or commit** (never `main`)
> and read the CHANGELOG before every upgrade.

> Defines the **stable public surface** of `ZSSI_IMPORTER` (what a consumer may bind to), what is
> **internal** (may change without notice), how **generated adapters** fit, and the **deprecation
> policy**. A reusable abapGit library is only safe to adopt if its public contract is explicit and
> durable. SAP's **C1 release contract** covers *Cloud cross-software-component* use; **this** is the
> library's own contract for **all** targets (on-prem 2023/2025 + Cloud). See also
> `versioning-and-ci.md` and `abap-style-guide.md` §2/§5.

## Golden rules

1. **Bind to interfaces and facades, never to internals or generated classes.**
2. **Stable public** objects change only on a **major** version; **internal** objects can change on
   any **minor**.
3. The **facade-never-raises** contract and the **`zif_ssi_types` shapes** are the most
   stability-critical — treat them as frozen.

## Runnable samples (one per API)

Every public API below has a **runnable, copy‑pasteable example**, each proven by an ABAP Unit test:

- **`abap-spreadsheetimporter-samples`** —
  the `ZCL_SSI_SAMPLES` classrun (`F9` to run them all) + a small self‑contained demo BO to import into.
- **[Usage cookbook](usage-cookbook.md)** —
  a snippet + expected output for each API in this contract.

## Stable public API — safe to depend on

| Object | Role | How a consumer uses it |
|---|---|---|
| **`ZIF_SSI_TYPES`** | Shared types: `ts_options` (incl. `mode`, `hooks`), `ts_row`/`ts_cell`, `ts_result`/`ts_message`/`ts_key`, `tt_map`, the `gc_mode` enum | Reference the types in your own code |
| **`ZIF_SSI_IMPORTER`** | The `import( it_rows is_options ) RETURNING rs_result` contract | The seam to **mock** the library (see [`test doubles`](#testing-against-the-library)) |
| **`ZIF_SSI_HOOKS`** | Optional developer **extension hooks** — `on_rows_parsed` / `coerce_field` / `on_before_persist` / `on_message` / `on_completed` (all `DEFAULT IGNORE`) | Implement the ones you need; inject via `ts_options-hooks` (see [Extension hooks](#extension-hooks-zif_ssi_hooks)) |
| **`ZCL_SSI_IMPORT`** | Facade — `import_file` (auto-detect xlsx/CSV) / `import_rows`. **Never raises** (errors → `ts_message`) | The simplest entry point |
| **`ZCL_SSI_IMPORT_ACTION`** | RAP **static-action** delegate — `execute( it_keys, iv_entity, [is_options,] CHANGING ct_result )` | One-line "upload a file → import into my BO" action handler; the optional `is_options` injects hooks / a mapping |
| **`ZCL_SSI_TEMPLATE_ACTION`** | RAP **function** delegate — `execute( … )` for `getCreateTemplate` | One-line template-download function handler |
| **`ZCL_SSI_TEMPLATE`** | `build_create_template( iv_entity, iv_sample_rows, it_mapping )` | Generate an `.xlsx` CREATE template |
| **`ZCL_SSI_ADAPTER_GEN`** | Code generators: `generate_flat` / `generate_deep` / `generate_upsert` / `generate_action` / `generate_template_function` | You **run** these to emit a typed adapter for your BO |
| **`ZCL_SSI_FACTORY`** | `register( iv_entity, iv_class )` — register your adapter | Wire a generated adapter for an entity |
| **`ZCL_SSI_PARSER`** | `parse_xlsx` / `parse_csv` / `coerce` / `convexit_of` — stateless parsing utilities (`parse_xlsx` raises `zcx_ssi_parse`, see [Exceptions](#exceptions)) | Advanced/standalone parsing |
| **Abstract & custom entities** — `ZSSI_A_IMPORT` · `ZSSI_A_IMPORT_FILE` · `ZSSI_A_FILE` · `ZSSI_A_RESULT` · `ZSSI_A_TEMPLATE` · `ZSSI_A_TFILE` · `ZSSI_C_TEMPLATE` | The action/function parameter & result shapes | Reference them in your BDEF `action`/`function` signatures |
| **`ZSSI_IMPORTER`** (message class) | The translatable messages | Surfaced in `ts_message`; reference numbers if you map them |

**Stability promise — _from 1.0_:** signatures and public component names of the above are **frozen within
a major version**; only *additive*, compatible changes (new optional params, new components) may appear in
a minor. **During `0.x` (now)** this promise is not yet in force — a breaking change can land in any
release, and will be called out in the CHANGELOG.

## Extension hooks (`ZIF_SSI_HOOKS`)

Inject custom logic into the import pipeline without forking the library. Implement `ZIF_SSI_HOOKS`
(every method is `DEFAULT IGNORE` — write **only** the hooks you need) and pass an instance via
`ts_options-hooks`:

```abap
DATA(ls_opt) = VALUE zif_ssi_types=>ts_options(
                 entity_name = 'ZSSI_R_S_ORD'   " the samples repo's demo BO
                 hooks       = NEW zcl_my_hooks( ) ).   " a class that INTERFACES zif_ssi_hooks
DATA(ls_result) = zcl_ssi_import=>import_file( iv_content = lv_xstring is_options = ls_opt ).
```

| Hook | When | What you can do |
|---|---|---|
| `on_rows_parsed` | after parse, before import | validate / transform / **filter** the rows (filtered rows reduce `requested`); append an `E` message to **abort** the whole request (reports the original count) |
| `coerce_field` | per cell, before the default coercion | **override** the conversion (`ev_handled = abap_true` ⇒ your `cv_value` wins; else default) |
| `on_before_persist` | before each `MODIFY ENTITIES` chunk | **mutate the payload IN PLACE** (e.g. stamp defaults) — do **not** add/remove instances or change `%CID`s; see the coverage note |
| `on_message` | per result message, before return | **drop** (`ev_skip`) or **reshape** a message (text / severity / field) |
| `on_completed` | once, after the import | **observe** the final result (audit log, follow‑on processing) — read‑only |

**Never‑raises is preserved.** Hooks signal problems via messages/flags, **not** exceptions — the
library wraps every hook call and turns a thrown exception into an `E` message (an `on_message` /
`on_completed` failure is appended **once** at the end; the original messages are kept), so the facade's
never‑raises contract still holds. To abort, add an `E` from `on_rows_parsed`; don't `RAISE`. A
**wrong‑typed** `hooks` object (one that does not implement `ZIF_SSI_HOOKS`) **fails the import closed**
with message 007 — configured hooks are never silently skipped.

**Coverage.** `on_rows_parsed`, `on_message` and `on_completed` run on **every facade outcome** —
`import_file` / `import_rows` including the abort, setup‑error and **parse‑failure** paths. On the
one‑line RAP delegate, inject hooks via the optional `is_options`:
`zcl_ssi_import_action=>execute( … is_options = VALUE #( hooks = NEW zcl_my_hooks( ) ) … )` — the
`%param` format fields override the base where supplied. Calling the importer **directly**
(`zcl_ssi_factory=>get_importer` → `import`) bypasses the facade, so only the engine‑level hooks run
there. `coerce_field` and `on_before_persist` are live on the **generic engine** (flat active
create); no generated adapter (**flat, deep or upsert**) runs them today — an adapter gets them once regenerated with a `ZCL_SSI_ADAPTER_GEN`
version that emits the calls (follow‑on). On the engine path `on_before_persist`'s instances table is
anonymous (RTTC‑built) — navigate it with `ASSIGN COMPONENT` (incl. the `%CONTROL` flags) and mutate
**in place**; a typed adapter passes its typed table. Worked examples: `ZCL_SSI_UNIT_HOOKS` (the library's own hook tests) and
the [usage cookbook](usage-cookbook.md).

## Internal — do NOT depend on (may change in any minor)

| Object | Why internal |
|---|---|
| **`ZCL_SSI_ENGINE`** | The generic flat-create engine; reached **via** `ZCL_SSI_IMPORT` / `ZCL_SSI_FACTORY`, never directly. Implements `ZIF_SSI_IMPORTER` — depend on the *interface*. |
| **`ZCL_SSI_UTIL`** | Shared helpers (response harvester, `fill_line`, `importable_fields`, `gc_comp`). Implementation detail shared by the engine, adapters and template generator. |
| **`ZCL_SSI_TEMPLATE_QUERY`** | `IF_RAP_QUERY_PROVIDER` plumbing behind the `ZSSI_C_TEMPLATE` stream; an internal RAP wiring detail. |

If you find yourself needing an internal object, that's a signal the **public** surface is missing
something — open an issue rather than binding to the internal.

## Generated adapters are consumer-owned (item 3)

`ZCL_SSI_ADAPTER_GEN` **emits adapter source** that you paste into **your own** package (e.g.
`ZCL_<you>_ORDER_ADAPTER`). These generated classes:

- **Live in your namespace/package**, not in `ZSSI_IMPORTER`. They are *your* code.
- **Implement `ZIF_SSI_IMPORTER`** and are wired via `ZCL_SSI_FACTORY=>register`. The library and your
  code reach them **only through `ZIF_SSI_IMPORTER`** — **never by the generated class name**.
- Are **regenerated** when the BO changes; treat the emitted source as build output, not as hand-maintained
  code (don't hand-edit it — change the BO + regenerate, or fix the generator template).

So the library ↔ adapter boundary is the **interface**, exactly as Clean ABAP prescribes ("expose
interfaces, not classes"). The generated class name is an implementation detail of *your* project.

## Deprecation policy

- **Semantic versioning** (see `versioning-and-ci.md`): a breaking change to a
  *stable public* object → **major**; an internal change or additive public change → **minor**; a fix →
  **patch**.
- **Deprecate, don't delete:** mark with `@deprecated` (ABAP Doc) + name the successor + keep it for
  **≥ 1 minor release** before removal in the next major. Record it in the CHANGELOG.
- **During `0.x`** this deprecate-then-remove cycle is **best-effort** — a pre-1.0 release may change or
  remove a public object without the full deprecation period (always recorded in the CHANGELOG). It
  becomes a hard guarantee at `1.0`.
- **Frozen-hardest:** the `facade-never-raises` contract, `zif_ssi_types` shapes, and the abstract-entity
  signatures (a consumer's BDEF binds to them — changing a field breaks their service `$metadata`).

## How the contract is enforced

- **ABAP Doc on every public method** (abaplint `abapdoc` rule) — the doc *is* the contract.
- **The interfaces (`ZIF_*`) are the binding surface**; classes behind them are refactorable.
- **C1 release contract** marks the shipped objects for Cloud cross-component consumption (only needed
  when a consumer is in a *different* software component on a Cloud target).

## Exceptions

The library raises a small **typed hierarchy** — catch `ZCX_SSI` to handle any of them in one place:

| Exception | Raised by | Meaning |
|---|---|---|
| **`ZCX_SSI`** | — (abstract base) | the catch-all; never raised directly |
| **`ZCX_SSI_PARSE`** | `ZCL_SSI_PARSER=>parse_xlsx` | the file is corrupt / unreadable / the wrong format (the original framework error is chained in `previous`) |
| **`ZCX_SSI_GENERATE`** | `ZCL_SSI_ADAPTER_GEN` generators | a supplied token is not a valid ABAP/CDS identifier — the code-injection guard (`parameter` = the offending token) |

All inherit `cx_static_check`. **The facade never raises** — `ZCL_SSI_IMPORT` catches internally and returns
`ts_message` rows; these exceptions surface only when you call the lower-level parser / generators directly.

## Testing against the library

Because `ZIF_SSI_IMPORTER` is the contract, consumers can **mock** the importer with
`CL_ABAP_TESTDOUBLE`, or use the shipped double `ZCL_SSI_IMPORTER_DOUBLE` — see its runnable
[test-double example](usage-cookbook.md)
in the samples cookbook. The static facade/action paths are tested through the **RAP BO test
doubles** (`CL_BOTD_*`) on the consumer's own BO.
