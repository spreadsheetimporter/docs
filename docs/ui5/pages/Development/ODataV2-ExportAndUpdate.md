# OData V2 export and update

UI5 Spreadsheet Importer 2.5.0 can export related OData V2 records and update them from an edited workbook. For application configuration, see [Deep Download](../spreadsheetdownload.md) and [Update existing records](../Update.md). The [Fiori Elements V2 Object Page example](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter/blob/ui5-cc-spreadsheetimporter-v2.5.0/examples/packages/ordersv2fe/webapp/ext/controller/ObjectPageExt.controller.js) shows both operations.

## Export related records

1. `MetadataHandlerV2` reads the V2 metamodel for entity keys, labels and navigation properties. `deepDownloadConfig.deepLevel` limits how far the export traverses related entities.
2. `ODataV2` turns the navigation tree into V2 `$expand` paths and reads from the bound entity set. For large results it can request additional pages using `$skip` and `$top`.
3. `DataAssigner` maps the results to worksheets, and `SpreadsheetGenerator` builds the workbook. Set `deepDownloadConfig.addKeysToExport` to `true` if users will upload edits.

## Update existing rows

Set `action` to `UPDATE`. The importer uses metadata keys from each row to match it to the backend record. For a draft-enabled Object Page, open the object in edit mode before downloading and uploading. If only the active record exists, the importer reports **Edit mode required** for that row.

`ODataV2RequestObjects` fetches the matching records and checks their draft state. `ODataV2.updateAsync` uses `ODataModel.createKey` to build the entity path and queues the write in the importer's dedicated request group. In the default partial-update mode, matching values are skipped and `updateConfig.columns` can restrict the fields sent. Setting `fullUpdate` to `true` changes which values are sent. The model's `defaultUpdateMethod` determines the HTTP method.

The [V2 model handler](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter/blob/ui5-cc-spreadsheetimporter-v2.5.0/packages/ui5-cc-spreadsheetimporter/src/controller/odata/ODataV2.ts) contains the read and write paths. The [wdi5 V2 update tests](wdi5.md#v2-update-tests) cover the download, edit, upload and save sequence.
