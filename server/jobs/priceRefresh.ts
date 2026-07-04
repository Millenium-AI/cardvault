import { supabaseAdmin } from '../supabase';
import { refreshInventoryPrices } from '../routes/uploads';

export async function runDailyPriceRefresh() {
  try {
    console.log('[Price Refresh Job] Starting daily price refresh...');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleItems, error: queryError } = await supabaseAdmin
      .from('inventory_items')
      .select('user_id, id')
      .or(`price_last_fetched_at.is.null,price_last_fetched_at.lt.${sevenDaysAgo}`)
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
    let processedItems = 0;

    for (const [userId, itemIds] of userMap.entries()) {
      try {
        console.log(`[Price Refresh Job] Refreshing ${itemIds.length} items for user ${userId}`);
        await refreshInventoryPrices(userId, itemIds, 'all');
        processedUsers++;
        processedItems += itemIds.length;
      } catch (e: any) {
        console.error(
          `[Price Refresh Job] Failed to refresh items for user ${userId}:`,
          e.message
        );
      }
    }

    console.log(
      `[Price Refresh Job] Complete: ${processedUsers} users, ${processedItems} items refreshed`
    );
  } catch (err: any) {
    console.error('[Price Refresh Job] Fatal error:', err.message);
  }
}
