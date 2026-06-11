# Troubleshooting & limits

## Symptom → cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| Upload "succeeds" but no data created | EML create silently no‑op'd: missing `%control`/mandatory data, or wrong RAP phase | The component sets `%control` per field; check the returned `reported`/`%msg` (can be non‑empty while `failed` is empty); ensure required data is present |
| `RAP_RUNTIME 019` "transaction cannot be revived" dump | A prior chunk failed and the next EML ran without rollback | The component issues `ROLLBACK ENTITIES` after any failure and starts the next chunk in a fresh transaction |
| Opaque short dump on import | Lower‑case `entity_name`/`sub_name` in the dynamic EML | The component upper‑cases them; if you pass a BO/association name, give it uppercase |
| Your validations don't run | `IN LOCAL MODE` was used (bypasses validations/auth/prechecks) | The component calls EML **non‑local** against your BO; don't enable a "local/privileged" mode unless you mean to |
| Determination loops / times out | Your determination issues `MODIFY` that re‑triggers itself | Guard your determination (don't re‑modify the trigger field set); not a component issue |
| Dates all blank / wrong | Native Excel date cells or wrong format | Use **text** dates in the template (see [Options & data types](options.md)) |
| Number‑range error `BEHAVIOR_ILLEGAL_STATEMENT` | Your BO's custom number range does its own `COMMIT WORK` | Set the number‑range object to **main‑memory buffering** |
| Drafts created as active rows | No draft adapter registered for the BO | Generate + register a draft adapter — the generic engine is active‑only |
| Big file slow / memory | XCO holds the workbook in memory; one huge commit | Lower `rowThreshold`, tune `chunk_size`; consider splitting the file |
| `COMMIT ENTITIES is not allowed with this status` dump | You called the engine from inside a RAP action/handler | The engine owns the commit — call it from your own job/controller (or set `defer_commit` so the framework commits at request end); the upload action must only *store* the file |
| Upload "succeeds", row has empty fields | A typed `CREATE FROM` without `%control` | Use `CREATE FIELDS ( … ) WITH` (auto‑sets control); the shipped handler / `fill_line` already do |

## Behaviour worth knowing

- **`IsCsv` is optional** — the format is auto‑detected from the file's magic bytes (xlsx ZIP vs text).
  Only set `IsCsv = true` to force the CSV branch for the rare CSV that begins with the bytes `PK`.
- **Per‑row results carry `severity` + `field`** — each message reports its real severity
  (`E`/`W`/`I`/`S`) and the offending element where the BO supplies one.
- **`mode`** — `create` (default) inserts; `update` changes existing rows by key; `upsert` does both.
  Created rows correlate back to the sheet by `%cid`, updated rows by key; the result carries separate
  `created` and `updated` counts (`failed = requested − created − updated`).

## Limits (current)

- **UPDATE / UPSERT** ships via a **generated upsert adapter** (single‑field key in v1). The generic
  engine stays **create‑only**: on S/4HANA 2023 the typed `TABLE FOR UPDATE` can't be RTTC‑built;
  on 2025 / ABAP Cloud the generic path could do it via `GET_BDEF_DERIVED_TYPE`.
- **Draft, deep/compositions, complex control** → on S/4HANA 2023 these need a typed adapter; on
  2025 / ABAP Cloud the generic engine handles them too (`GET_BDEF_DERIVED_TYPE`, newer‑release only).
  So the *zero‑code* reach depends on your backend release.
- **CURR / QUAN decimal‑shift** is not applied (see [Options & data types](options.md)).
- **XLSX + CSV** only; large files are bounded by ABAP memory (XCO in‑memory) — chunked commits
  mitigate, but test at your volumes. Proven: 2000 rows in ~2.6 s on a trial box.
- **CREATE template download** is plain data on 758 (no styling/dropdowns/locked cells) — see
  [Template download](template-download.md).
