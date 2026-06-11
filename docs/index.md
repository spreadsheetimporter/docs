# Spreadsheet Importer — Documentation

The **Spreadsheet Importer** lets your users get Excel (`.xlsx`) and CSV data into SAP — from the
browser, from the backend, or both. It comes in two complementary parts that share one philosophy
(import **through** your application layer, so your validations and authorizations always run):

<div class="grid cards" markdown>

-   :material-microsoft-excel: **UI5 Spreadsheet Importer** *(frontend)*

    A UI5 custom control that adds a spreadsheet‑upload dialog to any UI5 / Fiori app. It parses and
    validates **in the browser**, then writes through the app's OData service (or the CAP CDS plugin).

    [→ UI5 component docs](ui5/index.md)

-   :material-server: **ABAP Spreadsheet Importer** *(backend)*

    A reusable **server‑side ABAP RAP** component. It parses xlsx/CSV **in the backend** and creates the
    rows through your own RAP business object via EML — so the BO's determinations, validations,
    numbering and authorizations all run. Built for large files and server‑side processing.

    [→ ABAP importer docs](abap/index.md)

</div>

## Which one do I need?

| | UI5 component *(frontend)* | ABAP importer *(backend)* |
|---|---|---|
| **Runs in** | the browser (your UI5 / Fiori app) | your S/4HANA or BTP ABAP backend |
| **Writes via** | the app's OData service / CAP CDS plugin | your own RAP BO, via dynamic EML |
| **Best for** | interactive uploads, rich inline validation, any UI5 app | large files, server‑side processing, RAP projects |
| **Install** | npm / UI5 Tooling | abapGit |
| **License** | open source (+ optional Pro edition) | commercial component |

**They interoperate.** The UI5 component can hand a file straight to the ABAP backend above a
configurable row threshold — the same upload dialog, parsed and inserted server‑side — so a single app
can keep small imports in the browser and offload large ones to ABAP.

## Quick links

- **New to the backend importer?** Start with the [ABAP overview](abap/index.md), then the
  [Integration Guide](abap/integration-guide.md).
- **Extending the import?** See [Extension hooks](abap/integration-guide.md#extension-hooks-zif_ssi_hooks)
  (`ZIF_SSI_HOOKS`) and the runnable [Usage Cookbook](abap/usage-cookbook.md).
- **Frontend component?** The full UI5 docs are at
  [docs.spreadsheet-importer.com](https://docs.spreadsheet-importer.com/) — see the
  [UI5 overview](ui5/index.md) here for the map.
