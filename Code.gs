/**
 * =================================================================================
 * Keep-like Tasks App Backend (Secure Version)
 * =================================================================================
 * This script's functions are called directly by an authenticated user via the
 * Google Apps Script API. It is NOT deployed as a public web app.
 *
 * DEPLOYMENT:
 * 1. Run `setupSheet` once to initialize the spreadsheet.
 * 2. In Project Settings (gear icon on the left), copy the "Script ID".
 * 3. NO "DEPLOYMENT" IS NEEDED. This script is run via authenticated API calls.
 * =================================================================================
 */

/**
 * Retrieves all tasks from the 'Tasks' sheet. This function is called by the
 * authenticated web app.
 * @returns {Array<Object>} An array of task objects.
 */
function getTasks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  if (!sheet) {
    // If the sheet doesn't exist, return an empty array.
    return [];
  }
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Return empty array if there are no tasks, only headers
  if (values.length < 2) {
    return [];
  }

  const [headers, ...rows] = values;
  
  const tasks = rows.map((row, index) => {
    const task = {};
    headers.forEach((header, i) => {
      task[header] = row[i];
    });
    // Add the original row number for easy updates/deletes later
    task.rowIndex = index + 2; 
    return task;
  });
  
  return tasks;
}


// NOTE: All other functions for creating, updating, and deleting tasks
// would be added here. They would be called in the same secure way
// by the authenticated front-end application.


/**
 * Initializes the spreadsheet with a simple 'Tasks' tab and headers.
 * This function should be run manually from the script editor once.
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    sheet = ss.insertSheet('Tasks');
  }
  sheet.clear();
  // Define the headers for your tasks sheet
  sheet.appendRow(['Subject', 'Start Date', 'Is it Completed']);
  sheet.setFrozenRows(1);

  // Make the "Is it Completed" column into checkboxes for convenience
  const completedColumn = sheet.getRange("C2:C");
  completedColumn.insertCheckboxes();
  
  SpreadsheetApp.getUi().alert("Secure sheet setup is complete!");
}

