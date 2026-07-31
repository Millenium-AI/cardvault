import { supabaseAdmin } from '../supabase';
import { storage } from '../storage';
import { refreshInventoryPrices } from '../routes/uploads';
import { sweepSalesForItems, getDivergenceBands } from '../tcgplayerSales';

export async function runDailyPriceRefresh() {
  try {
    console.log('[Price Refresh Job] Starting daily price refresh...');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Include items that are:
    //   1. Never fetched (null timestamp)
    //   2. Stale (last fetched > 7 days ago)
    //   3. Still pending — price_source was never resolved, regardless of timestamp
    const { data: staleItems, error: queryError } = await supabaseAdmin
      .from('inventory_items')
      .select('user_id, id')
      .or(
        `price_last_fetched_at.is.null,` +
        `price_last_fetched_at.lt.${sevenDaysAgo},` +
        `price_source.eq.pending`
      )
      .limit(10000);

    if (queryError) {
      console.error('[Price Refresh Job] Query error:', queryError.message);
      return;
    }

    if (!staleItems?.length) {
      console.log('[Price Refresh Job] No stale items found');
      return;
    }

    console.log(`[Price Refresh Job] Found ${staleItems.length} stale items`);

    const userMap = new Map<string, string[]>();
    for (const item of staleItems) {
      const ids = userMap.get(item.user_id) ?? [];
      ids.push(item.id);
      userMap.set(item.user_id, ids);
    }

    let processedUsers = 0;
    let actuallyPricedItems = 0;
    let salesSweptUsers = 0;

    for (const [userId, itemIds] of userMap.entries()) {
      try {
        console.log(`[Price Refresh Job] Refreshing ${itemIds.length} items for user ${userId}`);
        const pricedCount = await refreshInventoryPrices(userId, itemIds, 'all');
        processedUsers++;
        actuallyPricedItems += pricedCount;

        try {
          const salesSettings = await storage.getSalesCheckSettings(userId);
          if (salesSettings.enabled) {
            console.log(`[Price Refresh Job] Running sales sweep for user ${userId}`);
            const sweepItems = await storage.listItemsForSalesSweep(userId, { staleHours: 24 });
            if (sweepItems.length) {
              const bands = await getDivergenceBands(userId);
              const sweepSummary = await sweepSalesForItems(userId, sweepItems, {
                windowDays: salesSettings.windowDays,
                autoAdjust: salesSettings.autoAdjust,
                bands,
              });
              console.log(`[Price Refresh Job] Sales sweep for user ${userId}: ${sweepSummary.productsChecked} products checked, ${sweepSummary.itemsUpdated} items updated`);
              salesSweptUsers++;
            }
          }
        } catch (e: any) {
          console.error(`[Price Refresh Job] Sales sweep failed for user ${userId}:`, e.message);
        }
      } catch (e: any) {
        console.error(
          `[Price Refresh Job] Failed to refresh items for user ${userId}:`,
          e.message
        );
      }
    }

    console.log(
      `[Price Refresh Job] Complete: ${processedUsers} users, ${actuallyPricedItems} items priced (${staleItems.length} attempted), ${salesSweptUsers} users swept for sales`
    );
  } catch (err: any) {
    console.error('[Price Refresh Job] Fatal error:', err.message);
  }
}
