/**
 * This script sets up the Google Sheet with the required tabs and headers
 * for the Keep-like Tasks App.
 *
 * To use:
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code into the editor.
 * 4. Save the script.
 * 5. From the function dropdown, select 'createSheetTemplate' and click 'Run'.
 * 6. Grant the necessary permissions when prompted.
 */

const VERSION = "1.0.0";

function createSheetTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetConfigs = [
    { name: "Tasks", headers: getTasksHeaders(), protection: "warn" },
    { name: "OccurrenceDone", headers: ["recurrence_id", "local_date", "is_done", "updated_at"], protection: "hide" },
    { name: "OccurrenceDeletes", headers: ["recurrence_id", "local_date", "updated_at"], protection: "hide" },
    { name: "OccurrenceEdits", headers: ["recurrence_id", "fields_json", "updated_at"], protection: "hide" },
    { name: "Splits", headers: ["original_task_id", "split_at", "new_task_id"], protection: "hide" },
    { name: "PriorityReminders", headers: ["Priority", "ReminderOffsets (minutes)"], protection: "warn" },
    { name: "CategoryReminders", headers: ["Category", "ReminderOffsets (minutes)"], protection: "warn" },
    { name: "SyncMeta", headers: ["key", "value"], protection: "hide" },
  ];

  sheetConfigs.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
    }
    setupSheet(sheet, config.headers, config.protection);
  });
  
  populateDefaultReminders(ss);
  populateCategories(ss);
  populateSyncMeta(ss);

  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  SpreadsheetApp.getUi().alert("Sheet setup complete!");
}

function setupSheet(sheet, headers, protectionType) {
  sheet.clear();
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#f3f4f6");
  sheet.autoResizeColumns(1, headers.length);

  if (protectionType === "hide") {
    sheet.hideSheet();
  } else if (protectionType === "warn") {
    const protection = sheet.protect().setDescription(`System sheet. Editing may break app functionality.`);
    protection.setWarningOnly(true);
  }

  if (sheet.getName() === "Tasks") {
    setupTasksSheet(sheet, headers);
  }
}

function getTasksHeaders() {
  const userHeaders = [
    "Subject", "Start Date", "Start Time", "End Date", "End Time",
    "Is it Completed", "Delete this", "Category", "Recurrence", "Repeat Count",
    "Priority", "Tags", "Notes"
  ];
  const systemHeaders = [
    "_Task ID", "_Timezone", "_Calendar Event ID", "_Last Calendar ETag",
    "_Last Calendar Sync At", "_Row Version", "_Created At", "_Updated At"
  ];
  return userHeaders.concat(systemHeaders);
}

function setupTasksSheet(sheet, headers) {
    const boolRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    setValidation(sheet, "Is it Completed", headers, boolRule);
    setValidation(sheet, "Delete this", headers, boolRule);

    const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
    setValidation(sheet, "Start Date", headers, dateRule);
    setValidation(sheet, "End Date", headers, dateRule);

    const priorities = ["Low", "Medium", "High", "Urgent"];
    const priorityRule = SpreadsheetApp.newDataValidation().requireValueInList(priorities).build();
    setValidation(sheet, "Priority", headers, priorityRule);

    const categorySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CategoryReminders");
    if(categorySheet) {
      const categoryRange = categorySheet.getRange("A2:A");
      const categoryRule = SpreadsheetApp.newDataValidation().requireValueInRange(categoryRange).build();
      setValidation(sheet, "Category", headers, categoryRule);
    }
}

function setValidation(sheet, headerName, headers, rule) {
    const colIndex = headers.indexOf(headerName) + 1;
    if (colIndex > 0) {
        const range = sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1);
        range.setDataValidation(rule);
    }
}

function populateSyncMeta(ss) {
    const sheet = ss.getSheetByName("SyncMeta");
    sheet.clearContents();
    sheet.appendRow(["version", VERSION]);
    sheet.appendRow(["settings_json", "{}"]);
}

function populateDefaultReminders(ss) {
    const sheet = ss.getSheetByName("PriorityReminders");
    sheet.clearContents();
    const data = [
      ["Urgent", "1440, 120, 30, 10"],
      ["High", "120, 30"],
      ["Medium", "30"],
      ["Low", "10"],
    ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}

function populateCategories(ss) {
    const sheet = ss.getSheetByName("CategoryReminders");
    sheet.clearContents();
    const data = [
      ["Deadlines", "2880, 1440, 120"],
      ["Meetings", "60, 10"],
      ["Finance", "4320, 1440"],
      ["Work", "1440, 30"],
      ["Health", "1440"],
      ["Personal", "1440"],
      ["Learning", "1440"],
      ["Tasks", "1440"],
      ["Chores", "1440"],
      ["Recharge", "1440"],
      ["Information", "1440"],
      ["Important Dates", "2880, 1440"],
      ["Subscriptions", "2880, 1440"],
      ["Custom", "1440"],
    ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}

