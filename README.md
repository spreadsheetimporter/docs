# Spreadsheet Importer documentation

This repository publishes the [Spreadsheet Importer documentation](https://docs.spreadsheet-importer.com/).

- The [UI5 guide](https://docs.spreadsheet-importer.com/ui5/pages/GettingStarted/) covers version 2.5.0 of the [UI5 Spreadsheet Importer](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter), including installation, configuration and the OData V2 and V4 examples. The Community Edition uses the Apache License 2.0.
- The [ABAP guide](https://docs.spreadsheet-importer.com/abap/) covers the separate server-side RAP importer.

## Build locally

From the root of this repository, use Python 3.11 or later.

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
mkdocs serve
```

Open <http://127.0.0.1:8000/> to preview changes. Edit UI5 pages in `docs/ui5/pages/`, ABAP pages in `docs/abap/` and navigation in `mkdocs.yml`.

Run `mkdocs build --strict` to reproduce the pull request check. Merging to `main` builds the site and publishes it through GitHub Pages.
