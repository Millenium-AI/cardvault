---
name: CardVault export endpoint redesign
description: POST /api/labels/export now queries inventory_items by label_status instead of label_queue_items; body changed from {ids, queueType} to {game, format, stickerMode}.
---

## The rule
`POST /api/labels/export` accepts `{ game?, format?, stickerMode? }` (no `ids` or `queueType`).
It fetches all `inventory_items` where `label_status IN ('needs_label','needs_repricing')`, builds the XLSX/CSV, then sets `label_status = 'label_created'` for all exported items.

**Why:** label_queue_items was a secondary audit table; simplifying to inventory_items as the single source of truth eliminates sync bugs.

## Frontend download
The export uses raw `fetch()` + blob download, NOT `apiRequest()`, because `apiRequest` calls `throwIfResNotOk` which reads the response body (making `.blob()` impossible afterward). See `getAuthHeader` from queryClient.ts for auth.
