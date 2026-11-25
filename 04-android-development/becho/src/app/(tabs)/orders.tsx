import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { useAuth } from '../../lib/auth-context';
import { useAppPreferences, type TranslationKey } from '../../lib/app-preferences';
import { Listing, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { getListingMetrics } from '../../lib/marketplace';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';
import type { ListingMetrics } from '../../lib/marketplace';

type ActivityTab = 'saved' | 'offers' | 'buying' | 'selling' | 'listings' | 'archived';

interface DealRecord {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  listing: Listing | null;
}

interface SavedRecord {
  listing_id: string;
  created_at: string;
  listing: Listing | null;
}

interface OfferRecord {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  listing: Listing | null;
}

interface ActivityEntry {
  key: string;
  listing: Listing;
  detail: string;
  action: 'unsave' | 'complete' | 'none' | 'resell' | 'respond' | 'cancel-offer' | 'review';
  dealId?: string;
  offerId?: string;
}

const TABS: { key: ActivityTab; translationKey: TranslationKey }[] = [
  { key: 'saved', translationKey: 'saved' },
  { key: 'offers', translationKey: 'offers' },
  { key: 'buying', translationKey: 'buying' },
  { key: 'selling', translationKey: 'selling' },
  { key: 'listings', translationKey: 'myListings' },
  { key: 'archived', translationKey: 'archivedListings' },
];

function ListingManagementCard({
  listing,
  metrics,
  onRelist,
}: {
  listing: Listing;
  metrics?: ListingMetrics;
  onRelist?: () => void;
}) {
  const router = useRouter();
  const { theme, t } = useAppPreferences();
  const statusLabel =
    listing.status === 'ACTIVE' ? t('active') : listing.status === 'SOLD' ? t('sold') : t('rented');

  return (
    <View
      className="mb-3 flex-row overflow-hidden rounded-2xl border"
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/listing/${listing.id}`)}
        className="h-[184px] w-[116px] items-center justify-center"
        style={{ backgroundColor: theme.background }}
        accessibilityRole="button"
        accessibilityLabel={`View ${listing.title}`}
      >
        {listing.images?.[0] ? (
          <Image source={{ uri: listing.images[0] }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={28} color="#6b7280" />
        )}
        <View className="absolute left-2 top-2 flex-row items-center rounded-full bg-black/70 px-2 py-1">
          <Ionicons name="eye-outline" size={12} color="#fff" />
          <Text className="ml-1 text-[10px] font-bold text-white">{metrics?.view_count ?? 0}</Text>
        </View>
      </TouchableOpacity>

      <View className="flex-1 justify-between p-3">
        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {listing.listing_type === 'RENT' ? t('forRent') : t('forSale')}
            </Text>
            <View
              className="rounded-full px-2 py-1"
              style={{ backgroundColor: listing.status === 'ACTIVE' ? `${theme.primary}26` : '#374151' }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: listing.status === 'ACTIVE' ? theme.primary : '#d1d5db' }}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push(`/listing/${listing.id}`)}>
            <Text className="text-sm font-bold leading-5 text-white" numberOfLines={2}>
              {listing.title}
            </Text>
          </TouchableOpacity>
          <Text className="mt-1 text-base font-extrabold" style={{ color: theme.primary }}>
            {formatListingPrice(listing)}
          </Text>
          <View className="mt-1 flex-row items-center">
            <Ionicons name="location-outline" size={13} color="#9ca3af" />
            <Text className="ml-1 flex-1 text-[11px] text-gray-400" numberOfLines={1}>
              {listing.locality ? `${listing.locality}, ` : ''}{listing.city}
            </Text>
          </View>
        </View>

        <View>
          <View className="mb-2 flex-row items-center">
            <Ionicons name="time-outline" size={12} color="#9ca3af" />
            <Text className="ml-1 text-[10px] text-gray-500">
              {t('posted')} {formatTimeAgo(listing.created_at)}
            </Text>
            <View className="ml-auto flex-row items-center">
              <Ionicons name="heart-outline" size={13} color="#f87171" />
              <Text className="ml-1 text-[10px] text-gray-400">{metrics?.like_count ?? 0}</Text>
            </View>
          </View>
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => router.push(`/listing/${listing.id}`)}
              className="flex-1 items-center rounded-lg py-2"
              style={{ backgroundColor: theme.primary }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${listing.title}`}
            >
              <Text className="text-[11px] font-bold text-[#052e16]">{t('viewListing')}</Text>
            </TouchableOpacity>
            {onRelist && (
              <TouchableOpacity
                onPress={onRelist}
                className="ml-2 items-center rounded-lg border px-3 py-2"
                style={{ borderColor: theme.border }}
                accessibilityRole="button"
                accessibilityLabel={`Relist ${listing.title}`}
              >
                <Text className="text-[11px] font-semibold text-gray-200">{t('relist')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, t } = useAppPreferences();
  const [tab, setTab] = useState<ActivityTab>('saved');
  const [saved, setSaved] = useState<SavedRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [listingMetrics, setListingMetrics] = useState<Map<string, ListingMetrics>>(new Map());
  const [listingSearch, setListingSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [reviewedDealIds, setReviewedDealIds] = useState<string[]>([]);
  const [reviewingDeal, setReviewingDeal] = useState<DealRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const tabs = useMemo(
    () => TABS.map((item) => ({ ...item, label: t(item.translationKey) })),
    [t]
  );

  const loadActivity = useCallback(async (refresh = false) => {
    if (!user) {
      setSaved([]);
      setOffers([]);
      setDeals([]);
      setMyListings([]);
      setListingMetrics(new Map());
      setReviewedDealIds([]);
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');
    try {
      const [savedResult, offersResult, dealsResult, listingsResult, reviewsResult] = await Promise.all([
        supabase
          .from('saved_listings')
          .select('listing_id, created_at, listing:listing_id (id, seller_id, title, description, listing_type, category, price, rent_period, security_deposit, city, locality, latitude, longitude, images, status, created_at)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('offers')
          .select('id, listing_id, buyer_id, seller_id, amount, status, created_at, listing:listing_id (id, seller_id, title, description, listing_type, category, price, rent_period, security_deposit, city, locality, latitude, longitude, images, status, created_at)')
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('deals')
          .select('id, listing_id, buyer_id, seller_id, amount, status, created_at, listing:listing_id (id, seller_id, title, description, listing_type, category, price, rent_period, security_deposit, city, locality, latitude, longitude, images, status, created_at)')
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('listings')
          .select('id, seller_id, title, description, listing_type, category, price, rent_period, security_deposit, city, locality, latitude, longitude, images, status, created_at')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('seller_reviews').select('deal_id').eq('reviewer_id', user.id),
      ]);

      const failed =
        savedResult.error ||
        offersResult.error ||
        dealsResult.error ||
        listingsResult.error ||
        reviewsResult.error;
      if (failed) throw failed;
      const listingRecords = (listingsResult.data ?? []) as unknown as Listing[];
      setSaved((savedResult.data ?? []) as unknown as SavedRecord[]);
      setOffers((offersResult.data ?? []) as unknown as OfferRecord[]);
      setDeals((dealsResult.data ?? []) as unknown as DealRecord[]);
      setMyListings(listingRecords);
      setReviewedDealIds((reviewsResult.data ?? []).map((review) => review.deal_id));
      try {
        setListingMetrics(await getListingMetrics(listingRecords.map((listing) => listing.id)));
      } catch (metricsError) {
        console.error('[Becho] Could not load listing performance metrics:', metricsError);
        setListingMetrics(new Map());
        setErrorMessage('Your activity loaded, but listing views and likes are unavailable right now.');
      }
    } catch (loadError) {
      console.error('[Becho] Could not load buyer and seller activity:', loadError);
      setErrorMessage('Activity could not be loaded. Apply the marketplace database migration and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity])
  );

  const entries = useMemo<ActivityEntry[]>(() => {
    if (tab === 'saved') {
      return saved.flatMap((item) =>
        item.listing
          ? [{ key: item.listing_id, listing: item.listing, detail: `Saved ${formatTimeAgo(item.created_at)}`, action: 'unsave' }]
          : []
      );
    }
    if (tab === 'offers') {
      return offers.flatMap((offer) => {
        if (!offer.listing) return [];
        const isSeller = offer.seller_id === user?.id;
        const action: ActivityEntry['action'] =
          offer.status !== 'pending' ? 'none' : isSeller ? 'respond' : 'cancel-offer';
        return [{
          key: offer.id,
          listing: offer.listing,
          detail: `${isSeller ? 'Buyer offer' : 'Your offer'} · ₹${Number(offer.amount).toLocaleString('en-IN')} · ${offer.status}`,
          action,
          offerId: offer.id,
        }];
      });
    }
    if (tab === 'buying' || tab === 'selling') {
      return deals.flatMap((deal) => {
        const isCurrentSide = tab === 'buying' ? deal.buyer_id === user?.id : deal.seller_id === user?.id;
        if (!isCurrentSide || !deal.listing) return [];
        const action: ActivityEntry['action'] =
          deal.status === 'in_progress' && deal.seller_id === user?.id
            ? 'complete'
            : tab === 'buying' &&
                deal.status === 'completed' &&
                !reviewedDealIds.includes(deal.id)
              ? 'review'
              : 'none';
        return [{
          key: deal.id,
          listing: deal.listing,
          detail: `${deal.status.replace('_', ' ')} · ${formatListingPrice({
            listing_type: deal.listing.listing_type,
            price: deal.amount,
            rent_period: deal.listing.rent_period,
          })}`,
          action,
          dealId: deal.id,
        }];
      });
    }
    if (tab === 'listings') {
      return myListings
        .filter((listing) => listing.status === 'ACTIVE')
        .map((listing) => ({
          key: listing.id,
          listing,
          detail: `${listing.status} · ${formatTimeAgo(listing.created_at)}`,
          action: 'none',
        }));
    }
    return myListings
      .filter((listing) => listing.status !== 'ACTIVE')
      .map((listing) => ({
        key: listing.id,
        listing,
        detail: `${listing.status} · ${formatTimeAgo(listing.created_at)}`,
        action: 'resell',
      }));
  }, [tab, saved, offers, deals, myListings, reviewedDealIds, user?.id]);

  const visibleEntries = useMemo(() => {
    const query = listingSearch.trim().toLocaleLowerCase();
    if (!query || (tab !== 'listings' && tab !== 'archived')) return entries;
    return entries.filter(({ listing }) =>
      [listing.title, listing.category, listing.city, listing.locality ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [entries, listingSearch, tab]);

  const activeListingCount = myListings.filter((listing) => listing.status === 'ACTIVE').length;
  const totalListingViews = myListings.reduce(
    (total, listing) => total + (listingMetrics.get(listing.id)?.view_count ?? 0),
    0
  );
  const totalListingLikes = myListings.reduce(
    (total, listing) => total + (listingMetrics.get(listing.id)?.like_count ?? 0),
    0
  );

  const removeSaved = async (listingId: string) => {
    if (!user) return;
    setUpdatingId(listingId);
    try {
      const { error } = await supabase
        .from('saved_listings')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId);
      if (error) throw error;
      setSaved((current) => current.filter((item) => item.listing_id !== listingId));
    } catch (removeError) {
      console.error('[Becho] Could not remove saved listing:', removeError);
      setErrorMessage('Could not remove the saved listing. Please retry.');
    } finally {
      setUpdatingId('');
    }
  };

  const completeDeal = async (dealId: string) => {
    if (!user) return;
    setUpdatingId(dealId);
    try {
      const { error } = await supabase
        .from('deals')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', dealId)
        .eq('seller_id', user.id);
      if (error) throw error;
      await loadActivity(true);
    } catch (completeError) {
      console.error('[Becho] Could not complete deal:', completeError);
      setErrorMessage('Could not update this deal. Check your seller permissions and retry.');
    } finally {
      setUpdatingId('');
    }
  };

  const respondToOffer = async (offerId: string, status: 'accepted' | 'declined' | 'cancelled') => {
    if (!user) return;
    setUpdatingId(offerId);
    try {
      const { error } = await supabase
        .from('offers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', offerId);
      if (error) throw error;
      await loadActivity(true);
    } catch (updateError) {
      console.error('[Becho] Could not update offer:', updateError);
      setErrorMessage('Could not update this offer. Check your permissions and retry.');
    } finally {
      setUpdatingId('');
    }
  };

  const resell = (listing: Listing) => {
    router.push({
      pathname: '/(tabs)/post',
      params: {
        type: listing.listing_type,
        title: listing.title,
        price: String(listing.price),
        category: listing.category,
      },
    });
  };

  const submitReview = async () => {
    if (!user || !reviewingDeal || submittingReview) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('seller_reviews').insert({
        deal_id: reviewingDeal.id,
        reviewer_id: user.id,
        seller_id: reviewingDeal.seller_id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });
      if (error) throw error;
      setReviewedDealIds((current) => [...current, reviewingDeal.id]);
      setReviewingDeal(null);
      setReviewComment('');
    } catch (reviewError) {
      console.error('[Becho] Could not submit seller review:', reviewError);
      setErrorMessage('Your review could not be saved. Check your connection and try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (!user) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: theme.background }}
      >
        <Ionicons name="albums-outline" size={40} color={BECHO_COLORS.textMuted} />
        <Text className="mt-4 text-lg font-bold text-white">{t('myActivity')}</Text>
        <Text className="mt-2 text-center text-sm text-gray-400">
          {t('activitySummary')}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          className="mt-5 rounded-xl px-5 py-3"
          style={{ backgroundColor: theme.primary }}
        >
          <Text className="font-bold text-[#052e16]">{t('signIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <View className="px-4 pb-4 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-2xl font-extrabold text-white">
              {tab === 'listings'
                ? t('myListings')
                : tab === 'archived'
                  ? t('archivedListings')
                  : t('myActivity')}
            </Text>
            <Text className="mt-1 text-sm text-gray-400">
              {tab === 'listings'
                ? t('manageActivePosts')
                : tab === 'archived'
                  ? t('reviewArchivedPosts')
                  : t('activitySummary')}
            </Text>
          </View>
          {tab === 'listings' && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/post')}
              className="flex-row items-center rounded-xl px-3 py-2.5"
              style={{ backgroundColor: theme.primary }}
              accessibilityRole="button"
              accessibilityLabel={t('createListing')}
            >
              <Ionicons name="add" size={18} color="#052e16" />
              <Text className="ml-1 text-xs font-bold text-[#052e16]">{t('newListing')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(item) => item.key}
        style={{ flexGrow: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' }}
        renderItem={({ item }) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              onPress={() => setTab(item.key)}
              className="mr-2 self-center rounded-full border px-4 py-2"
              style={{
                backgroundColor: active ? `${theme.primary}1A` : theme.surface,
                borderColor: active ? theme.primary : theme.border,
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: active ? theme.primary : '#d1d5db' }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      {(tab === 'listings' || tab === 'archived') && (
        <View className="px-4 pb-3">
          <View className="mb-3 flex-row">
            {[
              { label: t('active'), value: activeListingCount, icon: 'pricetag-outline' as const },
              { label: t('views'), value: totalListingViews, icon: 'eye-outline' as const },
              { label: t('likes'), value: totalListingLikes, icon: 'heart-outline' as const },
            ].map((stat, index) => (
              <View
                key={stat.label}
                className={`flex-1 rounded-xl border p-3 ${index < 2 ? 'mr-2' : ''}`}
                style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              >
                <View className="flex-row items-center">
                  <Ionicons name={stat.icon} size={14} color={theme.primary} />
                  <Text className="ml-1.5 text-[10px] font-medium text-gray-400">{stat.label}</Text>
                </View>
                <Text className="mt-1 text-lg font-extrabold text-white">{stat.value}</Text>
              </View>
            ))}
          </View>
          <View
            className="flex-row items-center rounded-xl border px-3"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            <Ionicons name="search-outline" size={18} color={BECHO_COLORS.textMuted} />
            <TextInput
              value={listingSearch}
              onChangeText={setListingSearch}
              placeholder={t('searchYourListings')}
              placeholderTextColor={BECHO_COLORS.textMuted}
              className="h-11 flex-1 px-3 text-sm text-white"
              accessibilityLabel={t('searchYourListings')}
            />
            {!!listingSearch && (
              <TouchableOpacity onPress={() => setListingSearch('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={BECHO_COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {!!errorMessage && (
        <View className="mx-4 mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
          <Text className="text-xs text-amber-200">{errorMessage}</Text>
        </View>
      )}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleEntries}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadActivity(true)}
              tintColor={BECHO_COLORS.primary}
            />
          }
          renderItem={({ item }) =>
            tab === 'listings' || tab === 'archived' ? (
              <ListingManagementCard
                listing={item.listing}
                metrics={listingMetrics.get(item.listing.id)}
                onRelist={item.action === 'resell' ? () => resell(item.listing) : undefined}
              />
            ) : (
            <View
              className="mb-3 flex-row overflow-hidden rounded-2xl border"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
            >
              <TouchableOpacity
                onPress={() => router.push(`/listing/${item.listing.id}`)}
                className="h-24 w-24 items-center justify-center"
                style={{ backgroundColor: theme.background }}
                accessibilityRole="button"
                accessibilityLabel={`View ${item.listing.title}`}
              >
                {item.listing.images?.[0] ? (
                  <Image
                    source={{ uri: item.listing.images[0] }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="image-outline" size={22} color={BECHO_COLORS.textMuted} />
                )}
              </TouchableOpacity>
              <View className="flex-1 flex-row items-center p-3">
                <TouchableOpacity
                  onPress={() => router.push(`/listing/${item.listing.id}`)}
                  className="flex-1"
                >
                  <Text className="font-bold text-white" numberOfLines={1}>{item.listing.title}</Text>
                  <Text className="mt-1 text-sm font-bold text-emerald-400">
                    {formatListingPrice(item.listing)}
                  </Text>
                  <Text className="mt-1 text-[10px] capitalize text-gray-500">{item.detail}</Text>
                </TouchableOpacity>
                {item.action === 'unsave' && (
                  <TouchableOpacity
                    onPress={() => void removeSaved(item.listing.id)}
                    disabled={updatingId === item.listing.id}
                    className="ml-2 h-9 w-9 items-center justify-center rounded-full bg-[#1f2937]"
                    accessibilityLabel="Remove saved listing"
                  >
                    {updatingId === item.listing.id ? (
                      <ActivityIndicator size="small" color={BECHO_COLORS.primary} />
                    ) : (
                      <Ionicons name="bookmark" size={16} color={BECHO_COLORS.primary} />
                    )}
                  </TouchableOpacity>
                )}
                {item.action === 'complete' && item.dealId && (
                  <TouchableOpacity
                    onPress={() => item.dealId && void completeDeal(item.dealId)}
                    disabled={updatingId === item.dealId}
                    className="ml-2 rounded-lg bg-emerald-500 px-3 py-2"
                  >
                    <Text className="text-[10px] font-bold text-[#052e16]">
                      {updatingId === item.dealId ? 'Saving…' : 'Complete'}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.action === 'resell' && (
                  <TouchableOpacity onPress={() => resell(item.listing)} className="ml-2 rounded-lg bg-[#1f2937] px-3 py-2">
                    <Text className="text-xs font-semibold text-emerald-300">Relist</Text>
                  </TouchableOpacity>
                )}
                {item.action === 'review' && (
                  <TouchableOpacity
                    onPress={() => {
                      const deal = deals.find((candidate) => candidate.id === item.dealId);
                      if (deal) setReviewingDeal(deal);
                    }}
                    className="ml-2 rounded-lg bg-emerald-500 px-3 py-2"
                  >
                    <Text className="text-[10px] font-bold text-[#052e16]">Rate seller</Text>
                  </TouchableOpacity>
                )}
                {item.action === 'respond' && item.offerId && (
                  <View className="ml-2 flex-row">
                    <TouchableOpacity
                      onPress={() => void respondToOffer(item.offerId!, 'declined')}
                      disabled={updatingId === item.offerId}
                      className="mr-2 rounded-lg bg-[#1f2937] px-2.5 py-2"
                      accessibilityLabel="Decline offer"
                    >
                      <Ionicons name="close" size={16} color="#f87171" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void respondToOffer(item.offerId!, 'accepted')}
                      disabled={updatingId === item.offerId}
                      className="rounded-lg bg-emerald-500 px-2.5 py-2"
                      accessibilityLabel="Accept offer"
                    >
                      <Ionicons name="checkmark" size={16} color="#052e16" />
                    </TouchableOpacity>
                  </View>
                )}
                {item.action === 'cancel-offer' && item.offerId && (
                  <TouchableOpacity
                    onPress={() => void respondToOffer(item.offerId!, 'cancelled')}
                    disabled={updatingId === item.offerId}
                    className="ml-2 rounded-lg bg-[#1f2937] px-3 py-2"
                  >
                    <Text className="text-[10px] font-semibold text-gray-300">{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            )
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <View
                className="h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: theme.surface }}
              >
                <Ionicons
                  name={tab === 'listings' ? 'pricetag-outline' : 'file-tray-outline'}
                  size={30}
                  color={theme.primary}
                />
              </View>
              <Text className="mt-4 text-base font-bold text-white">
                {tab === 'listings'
                  ? listingSearch.trim()
                    ? t('noMatchingListings')
                    : t('noActiveListings')
                  : tab === 'archived'
                    ? t('noArchivedListings')
                    : t('nothingHere')}
              </Text>
              <Text className="mt-1 text-center text-sm leading-5 text-gray-400">
                {tab === 'listings'
                  ? listingSearch.trim()
                    ? t('tryAnotherListingSearch')
                    : t('postToReachBuyers')
                  : tab === 'archived'
                    ? t('archivedEmpty')
                    : tab === 'saved'
                      ? t('saveListingsLater')
                      : t('activityWillAppear')}
              </Text>
              {tab === 'listings' && !listingSearch.trim() && (
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/post')}
                  className="mt-4 rounded-xl px-5 py-3"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Text className="text-xs font-bold text-[#052e16]">{t('createFirstListing')}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
      <Modal
        visible={reviewingDeal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewingDeal(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111827] p-5">
            <Text className="text-lg font-bold text-white">How was the seller?</Text>
            <Text className="mt-1 text-sm text-gray-400">
              Share a rating for {reviewingDeal?.listing?.title || 'this completed deal'}.
            </Text>
            <View className="my-5 flex-row justify-center">
              {[1, 2, 3, 4, 5].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  onPress={() => setReviewRating(rating)}
                  className="mx-1 p-1"
                  accessibilityLabel={`${rating} star${rating === 1 ? '' : 's'}`}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={rating <= reviewRating ? 'star' : 'star-outline'}
                    size={30}
                    color={rating <= reviewRating ? '#fbbf24' : '#6b7280'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Add a note (optional)"
              placeholderTextColor={BECHO_COLORS.textMuted}
              multiline
              maxLength={500}
              className="min-h-24 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              textAlignVertical="top"
            />
            <View className="mt-4 flex-row">
              <TouchableOpacity
                onPress={() => setReviewingDeal(null)}
                disabled={submittingReview}
                className="mr-2 flex-1 items-center rounded-xl bg-[#1f2937] py-3"
              >
                <Text className="font-semibold text-gray-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitReview()}
                disabled={submittingReview}
                className="flex-1 items-center rounded-xl bg-emerald-500 py-3"
              >
                {submittingReview ? (
                  <ActivityIndicator size="small" color="#052e16" />
                ) : (
                  <Text className="font-bold text-[#052e16]">Submit rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
