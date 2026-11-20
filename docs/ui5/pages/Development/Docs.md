# Contributing to the documentation

The [documentation repository](https://github.com/spreadsheetimporter/docs) hosts the public UI5 and ABAP guides. Edit UI5 guides in `docs/ui5/pages/`. Add new pages to the navigation in `mkdocs.yml`.

To preview a change, use the [local setup instructions](https://github.com/spreadsheetimporter/docs#build-locally) and run `mkdocs serve`. Run `mkdocs build --strict` before opening a pull request.

The [deployment workflow](https://github.com/spreadsheetimporter/docs/blob/main/.github/workflows/deploy.yml) builds the site on pushes to `main` and publishes it from `gh-pages`.
