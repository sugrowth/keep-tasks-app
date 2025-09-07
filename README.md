# keep-tasks-app
keep-tasks-app
# **Keep-like Tasks App \- User and Deployment Guide**

This guide contains everything you need to deploy and use the application for free.

## **Part 1: Final Deployment Checklist**

You have already completed all the setup in Google Cloud. Here are the final four steps to get your app running.

**Step 1: Paste Your Keys into app.html**

1. Open the app.html file in a text editor.  
2. Find these two lines near the bottom of the file:  
   const CLIENT\_ID \= 'YOUR\_CLIENT\_ID.apps.googleusercontent.com';  
   const API\_KEY \= 'YOUR\_API\_KEY';

3. Replace the placeholder text with the actual **Client ID** and **API Key** you copied from the Google Cloud Console.  
4. Save the file.

**Step 2: Set Up Your Google Sheet**

1. Go to [sheets.google.com](https://sheets.google.com) and create a **new, blank spreadsheet**.  
2. In your new sheet, click **Extensions \> Apps Script**.  
3. Delete any existing code in the editor.  
4. Open the sheets\_template\_setup.gs file, copy its entire contents, and paste it into the Apps Script editor.  
5. Click the **Save project** icon.  
6. From the function dropdown list at the top, select createSheetTemplate and click **Run**. Authorize the script when prompted.  
7. Your sheet is now correctly formatted. Copy the **Sheet ID** from your spreadsheet's URL (the long string of characters in the middle of the URL).

**Step 3: Upload the App to GitHub Pages**

1. Go to [GitHub.com](https://github.com/) and create a new repository with the special name: sugrowth.github.io (using your username). Make it public.  
2. In the new repository, click **Add file \> Upload files**.  
3. Drag and drop your edited and saved app.html file into the browser.  
4. Click **Commit changes**.

**Step 4: Configure and Use Your Live App\!**

1. Wait about a minute, then open your new live application by going to this URL in your browser:  
   https://sugrowth.github.io/app.html  
2. Click **"Connect Google Account"** and sign in.  
3. Click the **Settings** icon (the gear).  
4. Paste the **Sheet ID** you copied from Step 2\.  
5. Select your desired calendar and timezone.  
6. Click **Save**.

**Congratulations\! Your application is now fully deployed and ready to use.**
