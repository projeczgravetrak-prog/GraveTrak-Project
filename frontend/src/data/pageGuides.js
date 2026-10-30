import { REQUIRED_DOCUMENTS, MAX_DOCUMENT_SIZE_MB } from './burialRequirements.js';

const guide = (title, purpose, steps, reminder, next) => ({ title, purpose, steps, reminder, next });

export const officeStarts = {
  mayor: {
    name: "City Mayor's Office", intro: 'Review citizen applications, coordinate the next steps, and monitor cemetery operations.',
    steps: ['Check the Executive Dashboard for pending work.', 'Open Applications and review the submitted documents.', 'Check citizen messages and received reports.'],
  },
  planning: {
    name: 'City Planning and Development Office', intro: 'Plan cemetery sections and keep the mapped layout consistent with the recorded inventory.',
    steps: ['Check capacity on the Planning Dashboard.', 'Select the correct cemetery in Zoning & Analytics.', 'Review Plot Records and Niche Records before making changes.'],
  },
  staff: {
    name: 'Cemetery Staff', intro: 'Locate burial spaces, maintain accurate occupant records, and report cemetery operations.',
    steps: ['Check the Admin Dashboard and select a cemetery.', 'Use Cemetery Map or Apartment Niches to find the exact space.', 'Review the record, then prepare the required operations report.'],
  },
  user: {
    name: 'Citizen', intro: 'Find a loved one, submit a burial application, and follow updates from the office.',
    steps: ['Prepare the documents listed in Burial Application.', 'Submit once and check Application Tracking.', 'Read office instructions and upload corrections when requested.'],
  },
  guest: {
    name: 'Visitor', intro: 'Explore the cemetery map and locate a recorded burial.',
    steps: ['Choose the correct cemetery.', 'Search for a name, grave ID, or section.', 'Open a result and check its location before viewing directions.'],
  },
};

const common = {
  'panel-columbarium': guide('Apartment Niches', 'Browse the niche wall by cemetery and section.', [
    'Choose the cemetery and section first; check the labels above the niche wall.',
    'Use the status filter or search to narrow the displayed spaces. Read the legend for each status.',
    'Select a niche to inspect its exact ID, location and occupant details.',
    'If your account has editing controls, verify the selected niche before saving any change.',
  ], 'An available space shown on the map is not a confirmed reservation. Follow the application and assignment process.', 'Confirm the resulting status in the niche wall and the records page.'),
  'panel-columbarium-records': guide('Niche / Grave Records', 'Find recorded occupants and review their assigned burial spaces.', [
    'Select the cemetery and use the available search and filters to find the record.',
    'Match the occupant, section, niche ID and level before opening an action.',
    'Review the details. Use only the edit, transfer or other actions available to your account.',
    'For a transfer, verify both the source record and destination niche before confirming.',
  ], 'A reply to a transfer request does not move an occupant. Execute an authorized transfer through the record controls and check both locations afterward.', 'Search again to confirm the updated record and its location.'),
  'panel-archive': guide('Archive', 'Review records removed from the active lists.', [
    'Choose the relevant archive category and find the record.',
    'Read the identifying details and reason before taking any action.',
    'If a restore or deletion control is available, read its confirmation carefully before proceeding.',
  ], 'Archived information may still be needed for verification. Confirm the office decision before deleting a record.', 'After a restoration, check the corresponding active list.'),
  'panel-settings': guide('Settings', 'Adjust the preferences and account controls available to you.', [
    'Open the relevant settings section and review its current values.',
    'Change the intended preference or field; use Save when the section provides it.',
    'Wait for confirmation. If saving fails, use the displayed error to correct the problem.',
  ], 'Exported records can contain personal information. Share them only with the intended authorized recipient.', 'Check that the saved setting appears correctly when you return to the page.'),
};

const mayor = {
  'panel-mayor-dash': guide('Executive Dashboard', 'Review cemetery capacity, application activity, appointments and citizen requests.', [
    'Select Old or New Cemetery before reading cemetery-specific figures.',
    'Review the pending activity and appointment lists to identify the next work item.',
    'Open Applications for document review and processing; use Reports to review staff submissions.',
    'Open a citizen message, read the request, and send a clear reply using the available response control.',
  ], 'Check the date and cemetery scope of each summary. Replying to a transfer request closes the communication; it does not reassign a burial space.', 'Continue with the relevant application, record or report.'),
  'panel-approvals': guide('Applications', 'Review applications and move each one through its permitted processing steps.', [
    'Use the status tabs, search, and Submitted from / Submitted to filters to find the application.',
    'Open the documents. Inspect every required file and mark its review result; give a specific note for a correction.',
    'Finalize the review. Use Finalize Review & Notify Corrections when correction is needed, or Done — Continue to Scheduling when requirements are complete.',
    'Use Schedule Interview when available. Follow the next actions offered for the application status.',
    'When assignment is available, select the correct Old or New Map and verify the destination before confirming.',
  ], 'Complete requirements do not by themselves mean final approval. Check the application ID, applicant and deceased before scheduling, rejecting or assigning.', 'Confirm the new status and location. The citizen can check the update in Application Tracking.'),
  'panel-users': guide('User Management', 'Find accounts and manage the access allowed by your own permissions.', [
    'Search for the person and verify their account details.',
    'Open the available account controls and review the current role and permissions.',
    'Change only the intended fields and save. Review the resulting account status.',
  ], 'Roles and permissions determine which office controls a person can use. Confirm the correct office before changing access.', 'Ask the account holder to sign in again if their access needs to refresh.'),
  'panel-reports': guide('Received Reports', 'Review cemetery operations reports and generate summaries for a selected period.', [
    'Choose From and To dates, or leave both empty for an Overall report.',
    'Select Generate Report and check the displayed reporting period and any loading errors.',
    'Review submitted operations reports and use the available acknowledgement control after checking their contents.',
    'Use Export Excel once the generated report is ready.',
  ], 'Changing the date fields does not generate a new report until you select Generate Report. Check the displayed period before exporting.', 'Confirm the acknowledgement or open the exported workbook to review it.'),
};

const planning = {
  'panel-planning-dash': guide('Planning Dashboard', 'Review recorded capacity and identify sections that need planning attention.', [
    'Read the cemetery and section labels alongside the capacity figures.',
    'Review the planning workspace and recent section activity.',
    'Open Zoning & Analytics to inspect the layout, or Plot Records / Niche Records to inspect the inventory.',
  ], 'Confirm the existing map and records before adding a new section to avoid duplicate spaces.', 'Use the relevant map or records page for the planned change.'),
  'panel-planning': guide('Zoning & Analytics', 'Inspect cemetery boundaries and plan section layouts.', [
    'Select the correct cemetery and locate the area you intend to inspect.',
    'Select an existing section to review its boundaries and layout before editing.',
    'Use Draw New Section when adding a section. Follow the drawing and layout prompts, and inspect the preview.',
    'Check the section name, boundary and layout before saving. Use Cancel Drawing to abandon an unfinished drawing.',
  ], 'A section layout affects the spaces shown in the system. Check for overlaps and confirm that the layout matches the intended cemetery area.', 'Verify the saved section on the map and check its inventory in the records pages.'),
  'panel-graves': guide('Plot Records', 'Review ground-plot inventory for the selected cemetery.', [
    'Select the cemetery, then use the section and status filters or search.',
    'Open the matching plot and check its ID, location and current status.',
    'Use the controls available to your account for the intended change and review the confirmation.',
  ], 'Verify existing occupant and assignment details before changing a plot. A map location alone is not enough to identify a burial.', 'Check that the record and its map location agree after saving.'),
  'panel-planning-archive': guide('CPDO Archive', 'Review archived planning records.', [
    'Find the archived section or record and check its cemetery.',
    'Review the archived details before choosing an available action.',
    'Read the confirmation carefully, then verify the resulting archive or active list.',
  ], 'Check related plots and niches before restoring a section or removing archived information.', 'Return to the map and records pages to verify any restored inventory.'),
};

const staff = {
  'panel-admin-dash': guide('Admin Dashboard', 'Review cemetery inventory and find records that need attention.', [
    'Choose Old or New Cemetery and check the inventory summary.',
    'Open a section or record from the dashboard to inspect the associated spaces.',
    'Use Cemetery Map to locate a space and Apartment Niches to inspect its level and occupant.',
  ], 'Check the selected cemetery before comparing counts or opening a record.', 'Confirm the relevant record before making an operational update.'),
  'panel-admin-map': guide('Cemetery Map', 'Locate sections and burial spaces within the cemetery.', [
    'Choose the cemetery and allow the map and records to finish loading.',
    'Search for a name, grave ID or section; use section and status filters to narrow the results.',
    'Select a result or map feature and verify its cemetery, section and record ID.',
    'Open the corresponding record when you need to inspect or update its details.',
  ], 'If loading fails, retry before treating a blank map as an empty cemetery.', 'Check the exact physical location with the recorded details before carrying out work.'),
  'panel-reports': guide('Cemetery Reports', 'Generate a period summary and review cemetery operations submissions.', [
    'Set From and To to the reporting dates, or leave both empty for Overall.',
    'Select Generate Report and wait until the selected period is displayed.',
    'Review the totals and application details before using Export Excel.',
    'For an operations submission, use the available submission controls, review the contents and confirm the recipient before submitting.',
  ], 'A report should reflect recorded operations. Resolve any loading error or incorrect reporting period before exporting or submitting.', 'Check the submission status in the reports list and review the exported file.'),
};

const publicMap = guide('Cemetery Map', 'Find a recorded burial and view its location or walking route.', [
  'Choose the correct cemetery and wait for its map and records to load.',
  'Search by name, grave ID or section, then select the matching result.',
  'Check the deceased name and location in the details before opening directions.',
  'Allow location access if you want live guidance. If location is unavailable, use the route preview and check its starting point.',
], 'A route preview may start at an entrance instead of your actual position. Check the route origin before following it.', 'Signed-in citizens can save a loved one and return through My Loved Ones.');

const user = {
  'panel-user-dash': guide('Dashboard', 'See your applications and the next action requested by the office.', [
    'Review your application cards and their current status.',
    'Open Application Tracking for the complete request details and office instructions.',
    'Use Burial Application for a new request, or Map to search for a loved one.',
  ], 'Check for an existing application before submitting another one for the same request.', 'Respond to any document-correction request and check for subsequent office updates.'),
  'panel-burial-application': guide('Burial Application', 'Submit the applicant information, deceased details and required documents for office review.', [
    'Prepare clear copies of the requirements shown below before starting.',
    'Complete the form accurately. Review names, contact details, dates and required fields before continuing.',
    `Attach each required file in PDF, JPG or PNG format, up to ${MAX_DOCUMENT_SIZE_MB} MB per file.`,
    'Choose Submit Burial Application, review the confirmation, and choose Yes, Submit once.',
    'Wait for confirmation, then check your request in Application Tracking.',
  ], 'Submission starts a review; it does not confirm a burial space. If the response times out, check Application Tracking before submitting again.', 'Watch for office instructions and upload corrected documents if requested.'),
  'panel-application-tracking': guide('Application Tracking', 'Follow applications, correction requests and office responses.', [
    'Find the request using its application ID and deceased name; open its details.',
    'Read the current status and office instructions. If Action Required is shown, select the requested replacement files and Submit Corrected Documents.',
    'Use Contact us to ask the office about the request. Read office replies in the page or notifications.',
    'Use Cancel only when it is available and provide a reason. For an eligible assigned application, submit a transfer request explaining the proposed change.',
  ], 'Cancellation is limited once an application has progressed. A transfer request or office reply does not move the burial; the office must process the approved change.', 'Check that your submission is confirmed and follow the next office instruction.'),
  'panel-loved-ones': guide('My Loved Ones', 'Keep shortcuts to burial locations you want to revisit.', [
    'Find the person on the map and verify the grave details before saving.',
    'Return to My Loved Ones and use the view action to locate a saved record on the map.',
    'Remove a saved entry when you no longer need the shortcut.',
  ], 'Removing a saved entry removes your shortcut; it does not delete the cemetery burial record.', 'Use the map details to check the location and view directions.'),
  'panel-settings': guide('Settings', 'Manage your profile, appearance, notification preferences and security controls.', [
    'Select the settings section you want to change.',
    'Review the existing value and update only the intended details or preference.',
    'Use Save where provided and check for confirmation or a validation message.',
  ], 'Keep your contact details accurate so the office can coordinate with you. Do not share your password or verification codes.', 'Return to the page to confirm that your change was saved.'),
};

const roleGuides = { mayor, planning, staff, user };
export function getPageGuide(role, panel) {
  if (!panel || panel === 'public-map') return publicMap;
  return roleGuides[role]?.[panel] || common[panel] || null;
}

export function getGuideRequirements(panel) {
  return panel === 'panel-burial-application' ? REQUIRED_DOCUMENTS : [];
}
