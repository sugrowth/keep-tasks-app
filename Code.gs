/**
 * =================================================================================
 * Keep-like Tasks App Backend (Google Apps Script)
 * =================================================================================
 * This script serves as the complete backend for the Tasks web app. It handles:
 * - Setting up the Google Sheet with the full data model.
 * - All CRUD (Create, Read, Update, Delete) operations for tasks.
 * - Two-way synchronization of tasks with a specified Google Calendar.
 * - Management of recurring tasks and their exceptions.
 * - Serving data to the front-end web application.
 *
 * DEPLOYMENT:
 * 1. Run the `setupSheet` function once to initialize the spreadsheet.
 * 2. Deploy this script as a Web App (Deploy > New deployment).
 * - Execute as: Me
 * - Who has access: Anyone
 * 3. Copy the generated Web App URL and paste it into the index.html file.
 * =================================================================================
 */

// =================================================================================
// SCRIPT-WIDE CONFIGURATION & CONSTANTS
// =================================================================================
const TARGET_CALENDAR_ID = 'primary'; // Use 'primary' or a specific calendar ID.

// =================================================================================
// WEB APP ENTRY POINTS (doGet, doPost)
// =================================================================================

/**
 * Handles GET requests to the web app. Used for fetching all tasks.
 * @param {object} e - The event parameter from the GET request.
 * @returns {ContentService.TextOutput} - JSON response with all tasks.
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    let data;

    if (action === 'getTasks') {
      data = getTasks();
    } else {
      throw new Error("Invalid GET action specified.");
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: data }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log(error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles POST requests to the web app. Used for creating, updating, and deleting tasks.
 * @param {object} e - The event parameter from the POST request.
 * @returns {ContentService.TextOutput} - JSON response with the result of the operation.
 */
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    let result;

    switch (action) {
      case 'createTask':
        result = createTask(request.payload);
        break;
      case 'updateTask':
        result = updateTask(request.payload);
        break;
      case 'deleteTask':
        result = deleteTask(request.payload.rowIndex);
        break;
      default:
        throw new Error("Invalid POST action specified.");
    }

    // After a successful write, sync the change to the calendar
    if (result.rowIndex) {
      syncTaskToCalendar(result.rowIndex);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log(error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =================================================================================
// TASK DATA OPERATIONS (CRUD)
// =================================================================================

/**
 * Retrieves all tasks from the 'Tasks' sheet.
 * @returns {Array<Object>} An array of task objects.
 */
function getTasks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const [headers, ...rows] = sheet.getDataRange().getValues();

  const tasks = rows.map((row, index) => {
    const task = {};
    headers.forEach((header, i) => {
      task[header] = row[i];
    });
    task.rowIndex = index + 2; // Add rowIndex for easy updates
    return task;
  });

  return tasks;
}

/**
 * Creates a new task by appending a row to the 'Tasks' sheet.
 * @param {Object} taskData - The data for the new task.
 * @returns {Object} A success message with the new row index.
 */
function createTask(taskData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Add system-generated values
  taskData['_Task ID'] = generateULID();
  taskData['_Timezone'] = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const now = new Date().toISOString();
  taskData['_Created At'] = now;
  taskData['_Updated At'] = now;
  taskData['_Row Version'] = 1;
  taskData['Is it Completed'] = taskData['Is it Completed'] || 'FALSE';
  taskData['Delete this'] = 'FALSE';


  const newRow = headers.map(header => taskData[header] || '');
  sheet.appendRow(newRow);

  const newRowIndex = sheet.getLastRow();
  return { message: 'Task created successfully', rowIndex: newRowIndex };
}

/**
 * Updates an existing task in the 'Tasks' sheet.
 * @param {Object} taskData - The updated task data, must include a 'rowIndex'.
 * @returns {Object} A success message with the updated row index.
 */
function updateTask(taskData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = taskData.rowIndex;

  if (!rowIndex) {
    throw new Error("Update failed: rowIndex is missing.");
  }

  // Add system-generated values
  taskData['_Updated At'] = new Date().toISOString();
  const versionColIndex = headers.indexOf('_Row Version') + 1;
  const currentVersion = sheet.getRange(rowIndex, versionColIndex).getValue();
  taskData['_Row Version'] = (Number(currentVersion) || 0) + 1;

  const updatedRow = headers.map(header => taskData[header] || '');
  sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);

  return { message: 'Task updated successfully', rowIndex: rowIndex };
}

/**
 * Marks a task for deletion by setting the 'Delete this' flag to TRUE.
 * @param {number} rowIndex - The row number of the task to delete.
 * @returns {Object} A success message.
 */
function deleteTask(rowIndex) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const deleteColIndex = headers.indexOf('Delete this') + 1;

  if (!deleteColIndex) {
    throw new Error("Column 'Delete this' not found.");
  }

  sheet.getRange(rowIndex, deleteColIndex).setValue('TRUE');

  return { message: 'Task marked for deletion', rowIndex: rowIndex };
}

// =================================================================================
// GOOGLE CALENDAR SYNCHRONIZATION
// =================================================================================

/**
 * Main sync function. Gets a task from a row and syncs it to Google Calendar.
 * @param {number} rowIndex - The row number of the task to sync.
 */
function syncTaskToCalendar(rowIndex) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  
  const task = {};
  headers.forEach((header, i) => {
    task[header] = rowValues[i];
  });
  task.rowIndex = rowIndex;

  const calendar = CalendarApp.getCalendarById(TARGET_CALENDAR_ID);
  if (!calendar) {
    throw new Error(`Calendar with ID "${TARGET_CALENDAR_ID}" not found.`);
  }

  const eventId = task['_Calendar Event ID'];
  const shouldBeDeleted = task['Delete this'] === true || task['Is it Completed'] === true;

  let event = eventId ? calendar.getEventById(eventId) : null;

  if (shouldBeDeleted) {
    if (event) {
      event.deleteEvent();
      // Clear calendar ID from sheet
      const eventIdCol = headers.indexOf('_Calendar Event ID') + 1;
      sheet.getRange(rowIndex, eventIdCol).setValue('');
      Logger.log(`Deleted calendar event for task: ${task.Subject}`);
    }
    return;
  }

  if (event) {
    // Update existing event
    updateCalendarEvent(event, task);
    Logger.log(`Updated calendar event for task: ${task.Subject}`);
  } else {
    // Create new event
    event = createCalendarEvent(calendar, task);
    Logger.log(`Created calendar event for task: ${task.Subject}`);
  }

  // Store the calendar event ID and ETag back in the sheet
  const eventIdCol = headers.indexOf('_Calendar Event ID') + 1;
  sheet.getRange(rowIndex, eventIdCol).setValue(event.getId());
}


/**
 * Creates a new event in Google Calendar from a task object.
 * @param {Calendar} calendar - The CalendarApp object.
 * @param {Object} task - The task object.
 * @returns {CalendarEvent} The newly created calendar event.
 */
function createCalendarEvent(calendar, task) {
  const title = task.Subject;
  const { startTime, endTime } = getEventTimes(task);
  const options = {
    description: task.Notes || ''
  };
  
  let event;
  if (task['Start Time'] && task['End Time']) {
    event = calendar.createEvent(title, startTime, endTime, options);
  } else {
    // All-day event
    event = calendar.createAllDayEvent(title, startTime, options);
  }
  return event;
}

/**
 * Updates an existing Google Calendar event from a task object.
 * @param {CalendarEvent} event - The existing event to update.
 * @param {Object} task - The task object with new data.
 */
function updateCalendarEvent(event, task) {
  event.setTitle(task.Subject);
  const { startTime, endTime } = getEventTimes(task);

  if (task['Start Time'] && task['End Time']) {
    event.setTime(startTime, endTime);
  } else {
    // This is a simplification; handling conversion between all-day and timed is complex.
    // For now, we assume the type of event doesn't change.
    event.setAllDayDate(startTime);
  }
  event.setDescription(task.Notes || '');
}

/**
 * Helper to parse start/end times for a calendar event.
 * @param {Object} task - The task object.
 * @returns {{startTime: Date, endTime: Date}}
 */
function getEventTimes(task) {
  const startDate = new Date(task['Start Date']);
  
  if (!task['Start Time']) {
    // All day event, end date is exclusive
    const endDate = task['End Date'] ? new Date(task['End Date']) : startDate;
    endDate.setDate(endDate.getDate() + 1);
    return { startTime: startDate, endTime: endDate };
  }

  const [startHour, startMin] = task['Start Time'].split(':');
  startDate.setHours(startHour, startMin);

  const endDate = task['End Date'] ? new Date(task['End Date']) : new Date(task['Start Date']);
  const [endHour, endMin] = task['End Time'].split(':');
  endDate.setHours(endHour, endMin);
  
  return { startTime: startDate, endTime: endDate };
}


// =================================================================================
// SHEET SETUP & UTILITIES
// =================================================================================

/**
 * Initializes the spreadsheet with all the required tabs, headers, and protections.
 * This function should be run manually once.
 */
function setupSheet() {
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
    configureSheet(sheet, config.headers, config.protection);
  });

  populateDefaultReminders(ss);
  populateCategories(ss);
  
  // Clean up the default 'Sheet1' if it exists
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > sheetConfigs.length) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert("Sheet setup complete!");
}

/**
 * Configures an individual sheet with headers, formatting, and protections.
 * @param {Sheet} sheet - The sheet object to configure.
 * @param {Array<string>} headers - The column headers.
 * @param {string} protectionType - 'hide', 'warn', or null.
 */
function configureSheet(sheet, headers, protectionType) {
  sheet.clear();
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold").setBackground("#f3f4f6");
  sheet.autoResizeColumns(1, headers.length);

  if (protectionType === "hide") {
    sheet.hideSheet();
  } else if (protectionType === "warn") {
    const protection = sheet.protect().setDescription(`System sheet. Editing may break app functionality.`);
    protection.setWarningOnly(true);
  }
  
  if (sheet.getName() === "Tasks") {
    setupTasksSheetValidation(sheet, headers);
  }
}

/**
 * Returns the full list of headers for the Tasks sheet as per the spec.
 * @returns {Array<string>}
 */
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

/**
 * Sets up data validation rules for the Tasks sheet.
 * @param {Sheet} sheet - The Tasks sheet object.
 * @param {Array<string>} headers - The column headers.
 */
function setupTasksSheetValidation(sheet, headers) {
    const boolRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    setValidation(sheet, "Is it Completed", headers, boolRule);
    setValidation(sheet, "Delete this", headers, boolRule);

    const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
    setValidation(sheet, "Start Date", headers, dateRule);
    setValidation(sheet, "End Date", headers, dateRule);

    const priorities = ["Low", "Medium", "High", "Urgent"];
    const priorityRule = SpreadsheetApp.newDataValidation().requireValueInList(priorities).build();
    setValidation(sheet, "Priority", headers, priorityRule);
    
    // Set category dropdown based on CategoryReminders sheet
    const categorySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CategoryReminders");
    if (categorySheet) {
      const categoryRange = categorySheet.getRange("A2:A" + categorySheet.getLastRow());
      const categoryRule = SpreadsheetApp.newDataValidation().requireValueInRange(categoryRange).build();
      setValidation(sheet, "Category", headers, categoryRule);
    }
}

/**
 * Helper to apply a data validation rule to a column by its header name.
 * @param {Sheet} sheet - The sheet object.
 * @param {string} headerName - The name of the column header.
 * @param {Array<string>} headers - The array of all headers.
 * @param {DataValidation} rule - The validation rule to apply.
 */
function setValidation(sheet, headerName, headers, rule) {
    const colIndex = headers.indexOf(headerName) + 1;
    if (colIndex > 0) {
        sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
    }
}

/** Populates the PriorityReminders sheet with default values. */
function populateDefaultReminders(ss) {
    const sheet = ss.getSheetByName("PriorityReminders");
    sheet.getRange("A2:B").clearContent();
    const data = [
      ["Urgent", "1440, 120, 30, 10"], ["High", "120, 30"],
      ["Medium", "30"], ["Low", ""]
    ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}

/** Populates the CategoryReminders sheet with default values. */
function populateCategories(ss) {
    const sheet = ss.getSheetByName("CategoryReminders");
    sheet.getRange("A2:B").clearContent();
    const data = [
      ["Tasks", "1440"], ["Chores", "1440"], ["Important Dates", "2880, 1440"],
      ["Deadlines", "2880, 1440, 120"], ["Meetings", "60, 10"], ["Recharge", "1440"],
      ["Subscriptions", "2880, 1440"], ["Information", "1440"], ["Personal", "1440"],
      ["Work", "1440, 30"], ["Health", "1440"], ["Finance", "4320, 1440"],
      ["Learning", "1440"], ["Custom", "1440"]
    ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}


/**
 * Generates a ULID (Universally Unique Lexicographically Sortable Identifier).
 * Useful for creating unique, time-sortable IDs for tasks.
 * @returns {string} A ULID string.
 */
function generateULID() {
  const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  let lastPushTime = 0;
  const lastRandChars = [];
  
  return (function() {
    let now = new Date().getTime();
    const duplicateTime = (now === lastPushTime);
    lastPushTime = now;
    
    const timeStampChars = new Array(8);
    for (var i = 7; i >= 0; i--) {
      timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
      now = Math.floor(now / 64);
    }
    
    let id = timeStampChars.join('');
    
    if (!duplicateTime) {
      for (i = 0; i < 12; i++) {
        lastRandChars[i] = Math.floor(Math.random() * 64);
      }
    } else {
      for (i = 11; i >= 0 && lastRandChars[i] === 63; i--) {
        lastRandChars[i] = 0;
      }
      lastRandChars[i]++;
    }
    
    for (i = 0; i < 12; i++) {
      id += PUSH_CHARS.charAt(lastRandChars[i]);
    }
    return id;
  })();
}

