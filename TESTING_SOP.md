# Testing SOP: Map Search This Area (E2E)

## Purpose
This SOP defines the end-to-end (E2E) test procedure for the map-native search flow:
"Search This Area" is the only search trigger, with no bottom CTA.

## Scope
This SOP validates:
- Floating search button visibility rules.
- Loading state behavior during search.
- Map interaction triggers (`click`, `move`, `zoom`).
- Bottom sheet role (filters only).

This SOP does not validate:
- Scraper data correctness.
- Backend ranking/business logic quality.

## Preconditions
1. Install dependencies:
   - `npm install`
2. Start local server:
   - `npm run dev`
3. Confirm app is reachable:
   - `http://localhost:7751/`
4. Use Playwright MCP to run browser interactions.

## Test Case 1: Initial State
Expected result:
- Floating "在此區域搜尋" button is hidden.
- No bottom search CTA exists.
- Bottom sheet is present for filters only.

Steps:
1. Open `http://localhost:7751/`.
2. Inspect visible controls.

Pass criteria:
- Search button is not visible on first load.
- No "搜尋附近餐廳" or "開始搜尋" button is visible.

## Test Case 2: Map Click Shows Floating Search Button
Expected result:
- Clicking map places/updates one marker.
- Floating "在此區域搜尋" button appears.

Steps:
1. Click on map area once.
2. Observe marker and floating button.

Pass criteria:
- Exactly one center marker is shown.
- Button text is `在此區域搜尋`.

## Test Case 3: Search Trigger and Loading State
Expected result:
- Floating button enters loading state.
- Search request is sent.
- Results section updates.
- Floating button hides after successful result update.

Steps:
1. With button visible, click `在此區域搜尋`.
2. Observe button text and disabled state.
3. Wait for request completion.

Pass criteria:
- Button changes to `搜尋中...` and is disabled while searching.
- Status bar shows search progress then success/warn/error message.
- Button hides after successful result rendering.

## Test Case 4: Map Move/Zoom Re-enables Search
Expected result:
- Any map pan or zoom after a search makes button visible again.

Steps:
1. Pan map.
2. Confirm floating button appears.
3. Zoom in/out once.
4. Confirm button remains visible.

Pass criteria:
- Button appears after `moveend` or `zoomend`.
- Button remains the only search entry point.

## Test Case 5: Bottom Sheet Constraints
Expected result:
- Bottom sheet contains filter controls only.
- No search action control exists in sheet.

Steps:
1. Open bottom sheet.
2. Inspect all controls.

Pass criteria:
- Sheet includes radius/min-score controls.
- No search button is present inside sheet.

## Optional Regression Checks
1. GPS FAB:
   - Tap GPS button.
   - Verify map recenters and floating search button appears.
2. Single Marker Rule:
   - Click multiple map points.
   - Verify only one marker exists and position updates.

## Evidence Collection
For each run, record:
- Date/time (local timezone).
- Commit hash or branch.
- Environment (`local`, OS, browser runtime).
- Pass/Fail per test case.
- Screenshots for failures.

## Result Template
Use this template in PRs/issues:

```txt
E2E SOP Run: Map Search This Area
Date: YYYY-MM-DD HH:mm (Asia/Taipei)
Env: local / <OS> / Playwright MCP
Ref: <branch-or-commit>

TC1 Initial State: PASS|FAIL
TC2 Map Click Shows Button: PASS|FAIL
TC3 Search Loading + Hide: PASS|FAIL
TC4 Move/Zoom Re-show: PASS|FAIL
TC5 Bottom Sheet Filters-Only: PASS|FAIL

Notes:
- ...

Artifacts:
- screenshot/path1.png
- screenshot/path2.png
```

