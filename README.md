# Spreadsheet Importer — Documentation

Combined documentation for the **Spreadsheet Importer** family:

- the **[UI5 Spreadsheet Importer](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter)** —
  the frontend UI5 custom control, and
- the **server-side ABAP RAP Spreadsheet Importer** — the backend component.

Built with [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/),
the same stack as the existing UI5 docs at [docs.spreadsheet-importer.com](https://docs.spreadsheet-importer.com/).

## Structure

```
docs/
├── index.md            # combined landing — the two-part ecosystem + "which one do I need?"
├── ui5/                # UI5 frontend component
│   └── index.md        # overview + map to the live UI5 docs (full integration in progress)
└── abap/               # ABAP backend importer
    ├── index.md            # overview, requirements, install, quick start
    ├── integration-guide.md
    ├── public-api-contract.md
    └── usage-cookbook.md
```

## Status

- **ABAP backend docs** — added (overview, integration guide, public API contract, usage cookbook),
  sanitized for a public site (no links into private/maintainer sources).
- **UI5 frontend docs** — a placeholder + map to the live site for now; full incorporation
  (snapshot vs. multi-repo build) is a follow-up.
- **Deploy** — not wired yet. CI runs `mkdocs build --strict` on every push/PR; publishing to a domain
  is a follow-up once the domain (vs. the live UI5 docs domain) is decided.

## Local development

```bash
pip install -r requirements.txt
mkdocs serve            # http://localhost:8000

# or, matching the UI5 repo's Docker workflow:
docker run --rm -it -p 8000:8000 -v ${PWD}:/docs squidfunk/mkdocs-material
```

`mkdocs build --strict` must pass (CI enforces it) — it fails on broken internal links and pages
missing from the nav.
