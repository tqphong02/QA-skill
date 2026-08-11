# UI Testcase Checklist (1.1. USER INTERFACE)

> **When to read this file**: When generating test cases for `1.1. USER INTERFACE` (`kind=ui`), the AI MUST rely on these checklists to design test cases and ensure full coverage of UI/UX scenarios. **IMPORTANT**: While these rules are in English, the generated testcase content (Description, Pre-condition, Procedure, Expected Results) MUST be written in **Vietnamese**.

Below is the required format and mandatory categories when writing testcases for the User Interface (UI):

## 1. Visual Interface
- Matches Figma design perfectly.
- Accurate fonts, colors, icons, and spacing (margin/padding).
- No misalignment, overlapping text, or cut-off content.
- Displays correctly across various screen sizes.

## 2. UI Components
- Inputs, buttons, dropdowns, checkboxes, and radio buttons render correctly.
- Modals, popups, tooltips, and tables function and display properly.
- All states (default, hover, focus, disabled, loading) are handled.

## 3. Validation (UI Level)
- Leave mandatory fields blank.
- Enter incorrect formats.
- Check character limits (min/max length).
- Handle special characters, whitespaces, and copy-pasting.
- Error messages: correct content, displayed in the right position, clear colors.

## 4. User Behavior
- Mouse interactions: Click, double-click.
- Keyboard interactions: Press Enter, Tab, Esc.
- Page scrolling, drag & drop operations.
- Browser navigation: Back, refresh, opening multiple tabs simultaneously.
- Rapid continuous clicking (spam clicking) on buttons.

## 5. Responsive
- Desktop, tablet, and mobile displays.
- Landscape and Portrait orientations.
- Browser zoom (in/out).
- Rendering behavior when content is too long or contains large data sets.

## 6. Navigation
- Links redirect to the correct destination pages.
- Breadcrumbs, menus, and tabs operate with correct logic.
- The Back button retains the correct state and previous data.
- Correct URLs, no unauthorized access allowed via URL manipulation.

## 7. Usability
- Logical Tab order (top to bottom, left to right).
- Clear and understandable labels.
- Easily recognizable Call-to-Action (CTA) buttons.
- Clear success or failure notifications (Toast/Snackbar).
- Users are not forced to perform redundant actions.

## 8. Cross-browser
- Chrome
- Firefox
- Safari
- Edge
