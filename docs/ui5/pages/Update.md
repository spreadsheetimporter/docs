# Update existing records

!!! note "Availability"
    UPDATE is experimental. It became available for OData V4 in 1.7.0. Version 2.5.0 adds OData V2, including draft-enabled entities.

## Usage

It is recommended, especially for Entities with GUID, to first download the data with the Spreadsheet Importer and include the keys.

1. Download the data with the Spreadsheet Importer and include the keys.
2. Edit the spreadsheet
3. Upload the data with the Spreadsheet Importer.

## Getting started

The minimal configuration to update entities instead of creating is:

```js
this.spreadsheetUploadUpdate = await this.editFlow
  .getView()
  .getController()
  .getAppComponent()
  .createComponent({
    usage: 'spreadsheetImporter',
    async: true,
    componentData: {
      context: this,
      tableId: 'ui.v4.ordersv4fe::OrdersObjectPage--fe::table::Items::LineItem-innerTable',
      action: 'UPDATE',
      deepDownloadConfig: {
        addKeysToExport: true,
        showOptions: false,
        filename: 'Items'
      },
      showDownloadButton: true
    }
  });
this.spreadsheetUploadUpdate.openSpreadsheetUploadDialog();
```

This configuration will show the download button and download all the available data for the referenced table.  
When you press the download button, the data will be downloaded including the keys necessary for the update.

You can then change the data in the spreadsheet and upload the data again.  
By default, only the changed properties are updated (partial update). You can change this by setting the `fullUpdate` property to `true` (see [Configuration](#configuration) below).

## How it works

When you upload the file to the App, it will do the usual checks if the columns are in the data model and the data is valid (see [Checks](./Checks.md)).  
The importer reads the matching backend records by key before it writes changes. For draft-enabled entities it checks active and draft records separately. It uses these results to report missing rows, select the correct draft and skip unchanged values in a partial update.

OData V4 uses a context binding for each change. OData V2 builds the entity path from its metadata keys and sends updates through a dedicated request group. For a working Fiori Elements V2 example, see the [Object Page controller](https://github.com/spreadsheetimporter/ui5-cc-spreadsheetimporter/blob/ui5-cc-spreadsheetimporter-v2.5.0/examples/packages/ordersv2fe/webapp/ext/controller/ObjectPageExt.controller.js).

<!-- prettier-ignore-start -->
!!! note "Draft-enabled entities on OData V2: edit mode required"
    A draft-enabled entity can only be changed through its draft. If a row matches an **active** record that has **no draft in progress** (the object is in display mode), the importer cannot modify it directly — it reports an *"Edit mode required"* message for that row and skips it. Open the object in edit mode first (which creates the draft), then download, edit and upload the data from that edit-mode state. You can also bind a custom action's `enabled` to the edit state (e.g. `"enabled": "{ui>/isEditable}"`) to disable Mass Update outside edit mode — see [Getting Started](./GettingStarted.md).
<!-- prettier-ignore-end -->

### Setting Values to NULL or Empty String

When updating data, you may need to explicitly clear a field or set it to an empty string. The Spreadsheet Importer supports this via two markers:

1. Download existing data (make sure to include keys: `addKeysToExport: true`)
2. Edit the spreadsheet:
   - **Leave cell empty** → Field is not changed (existing value preserved)
   - **Type `__NULL__`** → Field is set to NULL (if nullable)
   - **Type `__EMPTY__`** → Field is set to empty string (text fields only)
   - **Type a new value** → Field is updated to that value
3. Upload the file

**Example**: Updating customer information

| ID  | Name         | Email     | Phone    | Notes     |
| --- | ------------ | --------- | -------- | --------- |
| 123 |              |           | 555-1234 |           |
| 456 | John Updated | `__NULL__`  |          | `__EMPTY__` |
| 789 |              | `__EMPTY__` |          | Follow up |

- Record 123: Only phone is updated, all other fields unchanged
- Record 456: Name updated, email set to NULL, notes set to empty string "", phone unchanged
- Record 789: Email set to empty string "", notes updated, name and phone unchanged

**Important**:

- `__NULL__` sets field to NULL (database NULL)
- `__EMPTY__` sets field to empty string "" (not NULL, only for text fields)
- Empty cell = no change (existing value preserved)

**Validation**:

- The component checks OData metadata for nullable fields
- If a field is non-nullable (Nullable="false"), you'll get an error when trying to set it to NULL
- Using `__EMPTY__` on non-string fields (numbers, booleans, dates) will cause an error

For detailed explanation with more examples, see [Null & Empty Value Handling](NullHandling.md).

## Things to consider / Drawbacks

### IsActiveEntity handling

The column `IsActiveEntity` states the current state of the object (Draft or Active). In the spreadsheet file, the current state must match the state of the object.

• If the state is wrong, a warning is shown and the user can still continue. If the user continues, the object will be updated in the current state that the object is actually in.  
 For example, if in the spreadsheet file the `IsActiveEntity` column is set to `true` but the object is in draft mode, a warning will be shown, and if the user continues, the draft object will be updated with the data from the spreadsheet.

### Download only Active Entities

If you download the data with the Spreadsheet Importer, only the active entities are downloaded. If you then update the data, the object will be updated in the current state that the object is in.  
So if the object is in draft mode, the data from the active state will still be used to update the draft object.

### Performance and batch size

Because the update needs extra requests (fetch of active and draft objects, plus partial updates), the update is slower than a create operation. For mass updates, this can take some time.  
Because of the performance considerations, the batch size for update is limited to 100 per batch.

### Filter Limitations

When exporting the data, currently all the data is exported. Any filters in a List Report are not respected at the moment.

## Configuration

Below is a brief overview of the main configuration options relevant to updating. For the complete list, see the [Configuration documentation](./Configuration.md).

| Option       | Description                                                                                | Default |
| ------------ | ------------------------------------------------------------------------------------------ | ------- |
| `fullUpdate` | Update all properties of the object (true). If false, only changed properties are updated. | false   |
| `columns`    | Columns to update.                                                                         | all     |

### fullUpdate

If `fullUpdate` is set to `true`, the component updates all properties of the object.  
If `fullUpdate` is set to `false` (default), only the properties that have changed are updated (partial update).

### columns

The `columns` property is an array of strings. The strings are the names of the columns that should be updated.  
Columns that are not in the array will not be updated at all. This is useful if you only want to update a subset of properties.

When using `fullUpdate = true`, the system will still honor `columns`—only those columns listed will be sent in the update request. For unlisted columns, no updates will be sent.
