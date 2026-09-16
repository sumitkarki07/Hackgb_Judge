/** These are the only browser-callable entry points. All implementation lives in a private bundle. */
function rpc(action, payload, token) { return Hub.rpc(action, payload, token); }
function doGet(e) {
  if (e && e.parameter && (e.parameter.code || e.parameter.error) && e.parameter.state) {
    var result = Hub.callback(e.parameter);
    return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:18px system-ui;padding:48px;color:#132b3b"><h1>HackGB JudgeHub</h1><p>' + (result.approved ? 'Google sign-in verified. Return to your original JudgeHub tab to continue.' : 'Sign-in was not approved or expired. Return to JudgeHub and try again, or contact an organizer.') + '</p></body></html>').setTitle('HackGB · Google sign-in');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('HackGB JudgeHub').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
/** Run manually in the Apps Script editor. Trailing underscore blocks google.script.run access. */
function initializeSpreadsheet_() { return Hub.initializeSpreadsheet(); }
