import { supabase } from './supabase';

export interface ListingMetrics {
  listing_id: string;
  view_count: number;
  like_count: number;
  average_rating: number;
  review_count: number;
  is_verified: boolean;
}

export async function getListingMetrics(
  listingIds: string[]
): Promise<Map<string, ListingMetrics>> {
  if (listingIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_listing_metrics', {
    p_listing_ids: listingIds,
  });
  if (error) throw error;

  return new Map(
    (data ?? []).map((metric: ListingMetrics) => [
      metric.listing_id,
      {
        ...metric,
        view_count: Number(metric.view_count),
        like_count: Number(metric.like_count),
        average_rating: Number(metric.average_rating),
        review_count: Number(metric.review_count),
      },
    ])
  );
}

export async function getSavedListingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('listing_id')
    .eq('user_id', userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.listing_id));
}

export async function setListingSaved(
  userId: string,
  listingId: string,
  saved: boolean
): Promise<void> {
  const result = saved
    ? await supabase.from('saved_listings').insert({ user_id: userId, listing_id: listingId })
    : await supabase
        .from('saved_listings')
        .delete()
        .eq('user_id', userId)
        .eq('listing_id', listingId);

  if (result.error) throw result.error;
}

export async function getLikedListingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select('listing_id')
    .eq('user_id', userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.listing_id));
}

export async function setListingLiked(
  userId: string,
  listingId: string,
  liked: boolean
): Promise<void> {
  const result = liked
    ? await supabase.from('listing_likes').insert({ user_id: userId, listing_id: listingId })
    : await supabase
        .from('listing_likes')
        .delete()
        .eq('user_id', userId)
        .eq('listing_id', listingId);

  if (result.error) throw result.error;
}

export async function recordListingView(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('record_listing_view', {
    p_listing_id: listingId,
  });
  if (error) throw error;
}
