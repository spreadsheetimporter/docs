# UI5 Spreadsheet Importer (frontend)

The **UI5 Spreadsheet Importer** is a UI5 custom control (`cc.spreadsheetimporter`) that adds a
spreadsheet‑upload dialog to any UI5 / Fiori app. Users upload Excel/CSV; the component parses and
validates in the browser and writes the data through the app's existing OData service — or, for CAP
projects, the bundled CDS plugin.

!!! info "Full UI5 docs are being integrated here"
    The complete UI5 component documentation currently lives at
    **[docs.spreadsheet-importer.com](https://docs.spreadsheet-importer.com/)** and is being folded into
    this combined site. Until that's done, the links below point to the live documentation.

## Key topics (live docs)

| Topic | What |
|---|---|
| [Getting Started](https://docs.spreadsheet-importer.com/pages/GettingStarted/) | Add the component to a UI5 / Fiori Elements app |
| [How it works](https://docs.spreadsheet-importer.com/pages/HowItWorks/) | The upload → parse → validate → submit flow |
| [Configuration](https://docs.spreadsheet-importer.com/pages/Configuration/) | All component options |
| [Events](https://docs.spreadsheet-importer.com/pages/Events/) & [Error Handling](https://docs.spreadsheet-importer.com/pages/Checks/) | Hook into and validate the import |
| [Using UPDATE](https://docs.spreadsheet-importer.com/pages/Update/) | Update existing records, not just create |
| [CAP CDS Plugin](https://docs.spreadsheet-importer.com/pages/CdsPlugin/) | Server‑side CAP integration |
| [API Reference](https://docs.spreadsheet-importer.com/pages/APIReference/) | Methods, properties, parameters |
| [Troubleshooting](https://docs.spreadsheet-importer.com/pages/Troubleshooting/) | Common issues |

## Source & editions

- **Component:** [`spreadsheetimporter/ui5-cc-spreadsheetimporter`](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter) (open source)
- **Community edition:** [`ui5-cc-spreadsheetimporter-community`](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter-community)

## Pairing with the backend importer

For large files or server‑side processing, the UI5 component can send the uploaded file to the
**[ABAP Spreadsheet Importer](../abap/index.md)** above a configurable row threshold — the same dialog,
parsed and inserted in your RAP backend. See the backend
[Integration Guide → Frontend configuration](../abap/integration-guide.md#step-3-frontend-configuration-ui5-spreadsheet-importer).
