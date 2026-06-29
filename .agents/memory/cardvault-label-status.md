---
name: CardVault label_status migration
description: label_status column on inventory_items is the new source of truth for label/export workflow; DB migration must be run manually in Supabase.
---

## The rule
`inventory_items.label_status` (NOT the `label_queue_items` table) is the source of truth for badge display and export filtering.

## Migration SQL (run in Supabase SQL Editor)
```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS label_status text NOT NULL DEFAULT 'needs_label'
  CHECK (label_status IN ('needs_label', 'needs_repricing', 'label_created'));

UPDATE public.inventory_items SET label_status = 'label_created';

CREATE INDEX IF NOT EXISTS idx_inventory_items_label_status
  ON public.inventory_items (user_id, label_status);
```

**Why:** backfill existing items to `label_created` so only genuinely new/repriced items show as pending.

## State machine
- New items added via upload approve → `needs_label`
- Existing items that cross repricing threshold → `needs_repricing` (unless already `needs_label`)
- After Niimbot export → `label_created`
