/**
 * =================================================================================
 * Keep-like Tasks App Backend (Google Apps Script)
 * =================================================================================
 * This script serves as the complete backend for the Tasks web app. It handles:
 * - Setting up the Google Sheet with the full data model.
 * - All CRUD (Create, Read, Update, Delete) operations for tasks.
 * - Synchronization of tasks with a specified Google Calendar.
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
// WEB APP ENTRY POINTS (doGet, doPost)
// =================================================================================

/**
 * Handles GET requests to the web app. Used for fetching all tasks.
 * @param {object} e - The event parameter from the GET request.
 * @returns {ContentService.TextOutput} - JSON response with all tasks.
 */
function doGet(e) {
  // Add a check to ensure 'e' and 'e.parameter' are defined
  if (!e || !e.parameter) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'This function is meant to be called from the web app.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

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

    // After a successful write, sync the change to the calendar if applicable
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
      // Ensure booleans are handled correctly for JSON
      if (row[i] === true || row[i] === false) {
        task[header] = row[i];
      } else {
        task[header] = row[i] || '';
      }
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

  taskData['_Task ID'] = generateULID();
  taskData['_Timezone'] = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const now = new Date().toISOString();
  taskData['_Created At'] = now;
  taskData['_Updated At'] = now;
  taskData['_Row Version'] = 1;
  taskData['Is it Completed'] = false; // Set to actual boolean
  taskData['Delete this'] = false; // Set to actual boolean

  const newRow = headers.map(header => taskData[header] === undefined ? '' : taskData[header]);
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

  taskData['_Updated At'] = new Date().toISOString();
  const versionColIndex = headers.indexOf('_Row Version') + 1;
  const currentVersion = sheet.getRange(rowIndex, versionColIndex).getValue();
  taskData['_Row Version'] = (Number(currentVersion) || 0) + 1;

  const updatedRow = headers.map(header => taskData[header] === undefined ? '' : taskData[header]);
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

  if (deleteColIndex === 0) {
    throw new Error("Column 'Delete this' not found.");
  }

  sheet.getRange(rowIndex, deleteColIndex).setValue(true);

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
  const TARGET_CALENDAR_ID = 'primary'; // Or load from a setting
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  
  const task = {};
  headers.forEach((header, i) => {
    task[header] = rowValues[i];
  });

  const calendar = CalendarApp.getCalendarById(TARGET_CALENDAR_ID);
  if (!calendar) {
    Logger.log(`Calendar with ID "${TARGET_CALENDAR_ID}" not found.`);
    return; // Silently fail if calendar not found
  }

  const eventId = task['_Calendar Event ID'];
  const shouldBeDeleted = task['Delete this'] === true || task['Is it Completed'] === true;

  try {
    let event = eventId ? calendar.getEventById(eventId) : null;

    if (shouldBeDeleted) {
      if (event) {
        event.deleteEvent();
        const eventIdCol = headers.indexOf('_Calendar Event ID') + 1;
        if (eventIdCol > 0) sheet.getRange(rowIndex, eventIdCol).setValue('');
        Logger.log(`Deleted calendar event for task: ${task.Subject}`);
      }
      return;
    }

    const { startTime, endTime } = getEventTimes(task);
    const options = { description: task.Notes || '' };

    if (event) {
      event.setTitle(task.Subject);
      event.setTime(startTime, endTime);
      event.setDescription(options.description);
      Logger.log(`Updated calendar event for task: ${task.Subject}`);
    } else {
      const newEvent = calendar.createEvent(task.Subject, startTime, endTime, options);
      const eventIdCol = headers.indexOf('_Calendar Event ID') + 1;
      if (eventIdCol > 0) sheet.getRange(rowIndex, eventIdCol).setValue(newEvent.getId());
      Logger.log(`Created calendar event for task: ${task.Subject}`);
    }
  } catch (e) {
    Logger.log(`Calendar sync failed for task "${task.Subject}": ${e.message}`);
  }
}

/** Helper to parse start/end times for a calendar event. */
function getEventTimes(task) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const startDate = new Date(task['Start Date']);
  
  if (!task['Start Time']) {
    return { startTime: startDate, endTime: new Date(startDate.getTime() + 24 * 60 * 60 * 1000) };
  }

  const [startHour, startMin] = task['Start Time'].split(':');
  const startTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHour, startMin);

  const endDateStr = task['End Date'] || task['Start Date'];
  const endTimeStr = task['End Time'] || task['Start Time'];
  const [endHour, endMin] = endTimeStr.split(':');
  const endDate = new Date(endDateStr);
  const endTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endHour, endMin);
  
  return { startTime, endTime };
}


// =================================================================================
// SHEET SETUP & UTILITIES
// =================================================================================

/**
 * Initializes the spreadsheet with all the required tabs and headers.
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // ... (rest of setup functions as before)
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
  
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > sheetConfigs.length) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert("Sheet setup complete!");
}

/** Configures an individual sheet. */
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
    const protection = sheet.protect().setDescription(`System sheet.`);
    protection.setWarningOnly(true);
  }
  
  if (sheet.getName() === "Tasks") {
    setupTasksSheetValidation(sheet, headers);
  }
}

/** Returns the full list of headers for the Tasks sheet. */
function getTasksHeaders() {
  const userHeaders = [ "Subject", "Start Date", "Start Time", "End Date", "End Time", "Is it Completed", "Delete this", "Category", "Recurrence", "Repeat Count", "Priority", "Tags", "Notes" ];
  const systemHeaders = [ "_Task ID", "_Timezone", "_Calendar Event ID", "_Last Calendar ETag", "_Last Calendar Sync At", "_Row Version", "_Created At", "_Updated At" ];
  return userHeaders.concat(systemHeaders);
}

/** Sets up data validation rules for the Tasks sheet. */
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
    
    const categorySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CategoryReminders");
    if (categorySheet) {
      const categoryRange = categorySheet.getRange("A2:A" + categorySheet.getLastRow());
      const categoryRule = SpreadsheetApp.newDataValidation().requireValueInRange(categoryRange).build();
      setValidation(sheet, "Category", headers, categoryRule);
    }
}

/** Helper to apply a data validation rule. */
function setValidation(sheet, headerName, headers, rule) {
    const colIndex = headers.indexOf(headerName) + 1;
    if (colIndex > 0) {
        sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
    }
}

/** Populates the PriorityReminders sheet. */
function populateDefaultReminders(ss) {
    const sheet = ss.getSheetByName("PriorityReminders");
    sheet.getRange("A2:B").clearContent();
    const data = [ ["Urgent", "1440, 120, 30, 10"], ["High", "120, 30"], ["Medium", "30"], ["Low", ""] ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}

/** Populates the CategoryReminders sheet. */
function populateCategories(ss) {
    const sheet = ss.getSheetByName("CategoryReminders");
    sheet.getRange("A2:B").clearContent();
    const data = [ ["Tasks", "1440"], ["Chores", "1440"], ["Important Dates", "2880, 1440"], ["Deadlines", "2880, 1440, 120"], ["Meetings", "60, 10"], ["Recharge", "1440"], ["Subscriptions", "2880, 1440"], ["Information", "1440"], ["Personal", "1440"], ["Work", "1440, 30"], ["Health", "1440"], ["Finance", "4320, 1440"], ["Learning", "1440"], ["Custom", "1440"] ];
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
}

/** Generates a ULID. */
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

