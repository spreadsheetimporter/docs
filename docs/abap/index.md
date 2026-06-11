# ABAP Spreadsheet Importer (backend)

A reusable, **server-side** ABAP RAP component that imports Excel (`.xlsx`) and CSV files into a
consuming RAP business object via dynamic EML — the ABAP counterpart to the
[UI5 Spreadsheet Importer](../index.md). Parsing and inserting happen **in the backend**
(offloading the browser for large files), and because inserts go through EML the consuming BO's
determinations, validations and authorizations all run — unlike a raw DB insert.

!!! warning "Early version — experimental"
    This component is at an **early, experimental stage** (`0.x`). The public API
    (`ZCL_SSI_*` / `ZIF_SSI_*` and the option/result types) **can still change** between releases —
    pin to a tag and check the [public API contract](public-api-contract.md) before upgrading.

!!! note "Commercial component"
    The ABAP importer is a commercial component; its source repositories are private. These docs
    describe how to integrate and use it. Contact the maintainers for licensing.

## What you get

- **Generic create** — point it at a RAP BO by name; flat active create needs **zero per-BO code**
  (payload built at runtime via RTTC).
- **XLSX + CSV** parsing (XCO for xlsx; an RFC‑4180 state machine for CSV — `;`/`,` auto‑detect,
  quoted fields, UTF‑8 BOM, configurable header row).
- **DDIC‑aware coercion** — dates, EU/US decimals, NUMC zero‑pad (+ reject), ALPHA key conversion,
  amounts/quantities with currency symbols and grouping, booleans.
- **Per‑row results** — created keys + messages with real severity and the offending field.
- **Synchronous** import (frontend waits, one OData call); an optional async/queue transport ships as a
  separate package for very large files.
- **Generated typed adapters** for **draft / deep / upsert** targets where the generic path can't reach.
- **Developer extension hooks** (`ZIF_SSI_HOOKS`) — inject custom logic (validate/filter rows, override a
  cell's conversion, mutate the payload, reshape/observe messages) without forking.

## Requirements

- **S/4HANA 2023** (SAP_BASIS 758) or higher, **or** SAP BTP ABAP Environment / S/4HANA Cloud.
- Developed in the **ABAP for Cloud Development** language version (clean core), so one codebase runs on
  on‑prem and Cloud.
- Your import target is a **RAP business object** (managed or unmanaged) that is EML‑create‑enabled.
- **abapGit** (ADT plugin) to install the component.

## Install (abapGit)

1. In your system, open **abapGit** → *New Online* → the component's repository URL.
2. Assign a package (objects use the `ZSSI_` prefix).
3. Pull, and activate.

## Quick start

```abap
DATA(result) = zcl_ssi_import=>import_file(
  iv_content = lv_xstring          " the raw .xlsx / .csv bytes
  is_options = VALUE #( entity_name = 'ZMY_ROOT_ENTITY' ) ).
" result-created / result-failed / result-keys / result-messages
```

The facade **never raises** — parse/insert problems come back as messages in `result`.

## Where to next

- **[Integration Guide](integration-guide.md)** — install, connect your target BO (zero‑code generic vs.
  generated adapter), frontend config, results, and the processing model.
- **[Fiori Elements & file upload](fiori-elements.md)** — add an "upload & import" action to your BO and
  surface it in a Fiori Elements app (with the metadata extension).
- **[Options & data types](options.md)** — the full `ts_options`, the end‑user data rules, and
  amounts/quantities parsing.
- **[Extension hooks](extension-hooks.md)** — inject validate / filter / coerce / observe logic without
  forking.
- **[Template download](template-download.md)** — give users a CREATE template that re‑imports zero‑config.
- **[Troubleshooting & limits](troubleshooting.md)** — symptom → cause → fix, and the current limits.
- **[Public API contract](public-api-contract.md)** — the stable public surface, the exception taxonomy,
  and the stability/deprecation policy.
- **[Usage cookbook](usage-cookbook.md)** — a copy‑pasteable snippet + expected output for **every** public
  API, each proven by an ABAP Unit test.
