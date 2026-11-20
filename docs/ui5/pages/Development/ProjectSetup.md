# UI5 importer project setup

The [UI5 Spreadsheet Importer repository](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter) contains the maintained Community Edition. The paths below refer to the [2.5.0 release tree](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter/tree/ui5-cc-spreadsheetimporter-v2.5.0).

| Path | What you can change or run |
| --- | --- |
| `packages/ui5-cc-spreadsheetimporter/src/` | The UI5 component, controls, dialogs, translations and OData handlers. Start with `Component.ts` for public settings and events. |
| `packages/ui5-cc-spreadsheetimporter/test/unit/` | Jest tests for parsing, metadata, OData requests and validation. |
| `examples/packages/` | Fiori Elements and freestyle sample applications for OData V2 and V4. |
| `examples/packages/server/` | The CAP service used by the sample applications. |
| `examples/test/` | wdi5 browser tests and shared test workbooks. |
| `dev/testapps.json` | App variants, UI5 versions and ports used for testing. |

## Run a sample

Use Node.js 22 and npm. From a fresh checkout, install the workspaces and start the CAP server and the default Fiori Elements V4 app.

```sh
git clone https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter
cd ui5-cc-spreadsheetimporter
npm ci --legacy-peer-deps
npm start
```

To try the V2 app instead, run `npm run start:server` in one terminal and `npm run start:v2fe` in another. Run `npm run test:unit --workspace=ui5-cc-spreadsheetimporter` for the component unit tests. See [wdi5 tests](wdi5.md) for browser testing and [Contributing to the documentation](Docs.md) to update the public guides.
