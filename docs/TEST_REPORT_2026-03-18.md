# E2E SOP Run: Map Search This Area

Date: 2026-03-18 20:27 (Asia/Taipei)  
Env: local / Playwright MCP  
Ref: working tree (uncommitted local changes)

TC1 Initial State: PASS  
TC2 Map Click Shows Button: PASS  
TC3 Search Loading + Hide: PASS  
TC4 Move/Zoom Re-show: PASS  
TC5 Bottom Sheet Filters-Only: PASS

Notes:
- Verified no legacy bottom CTA exists (`#search-btn` absent, no "開始搜尋", no "搜尋附近餐廳").
- Verified floating button is the only search trigger.
- Verified single-marker behavior across repeated map clicks (marker count remains 1).
- One non-blocking console error observed: `GET /favicon.ico 404`.

Artifacts:
- Playwright snapshots captured during run (MCP session output).
