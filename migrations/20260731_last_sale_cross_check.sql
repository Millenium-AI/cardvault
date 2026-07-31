-- Applied to Supabase project qivbhfznfroajwgaowsl on 2026-07-31
-- Migration name: last_sale_cross_check_and_adjusted_pricing
--
-- Phase 1 of the TCGplayer last-sale cross-check feature. Adds sales-derived
-- pricing columns to inventory_items and the product_sales feed table.
-- See docs/last-sale-implementation-guide.md for the remaining phases.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS adjusted_market_price numeric,
  ADD COLUMN IF NOT EXISTS last_sale_date timestamptz,
  ADD COLUMN IF NOT EXISTS last_sale_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale_outliers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale_match text,
  ADD COLUMN IF NOT EXISTS last_sale_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_divergence_pct numeric,
  ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.inventory_items
    ADD CONSTRAINT inventory_items_last_sale_match_check
    CHECK (last_sale_match IS NULL OR last_sale_match = ANY (ARRAY['exact'::text,'condition_only'::text,'none'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.inventory_items.adjusted_market_price IS 'Mean of outlier-filtered TCGplayer sales matching this condition+printing. Drives print price when present.';
COMMENT ON COLUMN public.inventory_items.price_locked IS 'Pin: excludes this item from automatic sales-based price adjustment.';
COMMENT ON COLUMN public.inventory_items.price_divergence_pct IS 'Signed (adjusted - market) / market * 100.';

-- Raw sales feed. Shipping is deliberately not stored.
CREATE TABLE IF NOT EXISTS public.product_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_product_id text NOT NULL,
  condition text,
  variant text,
  language text,
  quantity integer NOT NULL DEFAULT 1,
  purchase_price numeric NOT NULL,
  order_date timestamptz NOT NULL,
  is_outlier boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_sales IS 'Recent TCGplayer sales per product, used to compute adjusted_market_price. Writes: backend/service_role only. Reads: own rows. Purged after 180 days.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sales_dedupe
  ON public.product_sales (user_id, source_product_id, order_date, purchase_price, coalesce(condition,''), coalesce(variant,''));

CREATE INDEX IF NOT EXISTS idx_product_sales_lookup
  ON public.product_sales (user_id, source_product_id, order_date DESC);

ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY product_sales_self ON public.product_sales FOR ALL TO public USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_role_all ON public.product_sales FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_divergence
  ON public.inventory_items (user_id, price_divergence_pct)
  WHERE price_divergence_pct IS NOT NULL;
