import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/app-text';
import { isPlatformOwner, useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { BECHO_COLORS } from '../lib/theme';

interface PlatformFlag {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
}

interface VerificationRequest {
  user_id: string;
  status: string;
  full_name: string;
  city: string;
}

interface ManagedListing {
  id: string;
  title: string;
  listing_type: 'SELL' | 'RENT';
  status: 'ACTIVE' | 'SOLD' | 'RENTED';
  city: string;
  price: number;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'urgent';
  is_active: boolean;
}

const FLAG_LABELS: Omit<PlatformFlag, 'enabled'>[] = [
  { key: 'maintenance_mode', title: 'Maintenance mode', description: 'Pause marketplace activity during planned work.' },
  { key: 'allow_listings', title: 'New listings', description: 'Allow sellers to publish listings.' },
  { key: 'chat_enabled', title: 'Buyer and seller chat', description: 'Allow conversations from listing pages.' },
  { key: 'offers_enabled', title: 'Offers', description: 'Allow buyers to send and negotiate offers.' },
  { key: 'rentals_enabled', title: 'Rentals', description: 'Allow rent listings across the marketplace.' },
  { key: 'require_verified_sellers', title: 'Verified sellers only', description: 'Require seller approval before publishing.' },
];

export default function AdminControlPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [flags, setFlags] = useState<PlatformFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [listings, setListings] = useState<ManagedListing[]>([]);
  const [hasMoreListings, setHasMoreListings] = useState(false);
  const [loadingMoreListings, setLoadingMoreListings] = useState(false);
  const [savingListingId, setSavingListingId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementSeverity, setAnnouncementSeverity] =
    useState<Announcement['severity']>('info');
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!isPlatformOwner(user)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const [settingsResult, requestsResult, listingsResult, announcementsResult] = await Promise.all([
        supabase.from('platform_feature_flags').select('setting_key, value'),
        supabase.from('verified_sellers').select('user_id, status').eq('status', 'pending'),
        supabase
          .from('listings')
          .select('id, title, listing_type, status, city, price, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('announcements')
          .select('id, title, body, severity, is_active')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (listingsResult.error) throw listingsResult.error;
      if (announcementsResult.error) throw announcementsResult.error;

      const values = new Map((settingsResult.data ?? []).map((row) => [row.setting_key, row.value]));
      setFlags(
        FLAG_LABELS.map((flag) => ({
          ...flag,
          enabled: values.get(flag.key) === true,
        }))
      );
      setListings(
        (listingsResult.data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          listing_type: row.listing_type === 'RENT' ? 'RENT' : 'SELL',
          status: row.status === 'SOLD' || row.status === 'RENTED' ? row.status : 'ACTIVE',
          city: String(row.city),
          price: Number(row.price),
          created_at: String(row.created_at),
        }))
      );
      setHasMoreListings((listingsResult.data ?? []).length === 50);
      setAnnouncements(
        (announcementsResult.data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          body: String(row.body),
          severity:
            row.severity === 'success' || row.severity === 'warning' || row.severity === 'urgent'
              ? row.severity
              : 'info',
          is_active: Boolean(row.is_active),
        }))
      );

      const requests = requestsResult.data ?? [];
      if (requests.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, city')
          .in('id', requests.map((request) => request.user_id));
        if (profilesError) throw profilesError;
        const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
        setVerificationRequests(
          requests.map((request) => ({
            user_id: request.user_id,
            status: request.status,
            full_name: profileMap.get(request.user_id)?.full_name || 'Becho seller',
            city: profileMap.get(request.user_id)?.city || 'Location not set',
          }))
        );
      } else {
        setVerificationRequests([]);
      }
      setErrorMessage('');
    } catch (loadError) {
      console.error('[Becho] Could not load owner controls:', loadError);
      setErrorMessage('Could not load controls. Apply the marketplace database migration first.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings])
  );

  const updateFlag = async (flag: PlatformFlag, enabled: boolean) => {
    if (!user || !isPlatformOwner(user)) return;
    const previousFlags = flags;
    setFlags((current) =>
      current.map((item) => (item.key === flag.key ? { ...item, enabled } : item))
    );
    setSavingKey(flag.key);
    try {
      const { error } = await supabase.from('platform_feature_flags').upsert({
        setting_key: flag.key,
        value: enabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (saveError) {
      console.error('[Becho] Could not update platform feature flag:', saveError);
      setFlags(previousFlags);
      Alert.alert('Setting not saved', 'Check your owner permissions and try again.');
    } finally {
      setSavingKey('');
    }
  };

  const reviewSeller = async (sellerId: string, status: 'verified' | 'rejected') => {
    if (!user || !isPlatformOwner(user)) return;
    try {
      const { error } = await supabase
        .from('verified_sellers')
        .update({ status, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('user_id', sellerId);
      if (error) throw error;
    } catch (reviewError) {
      console.error('[Becho] Could not update seller verification:', reviewError);
      Alert.alert('Could not update seller', 'Check your owner permissions and retry.');
      return;
    }
    setVerificationRequests((current) => current.filter((request) => request.user_id !== sellerId));
  };

  const updateListingStatus = async (listing: ManagedListing) => {
    if (!isPlatformOwner(user)) return;
    const status =
      listing.status === 'ACTIVE'
        ? listing.listing_type === 'RENT'
          ? 'RENTED'
          : 'SOLD'
        : 'ACTIVE';
    setSavingListingId(listing.id);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status })
        .eq('id', listing.id);
      if (error) throw error;
      setListings((current) =>
        current.map((item) => (item.id === listing.id ? { ...item, status } : item))
      );
    } catch (updateError) {
      console.error('[Becho] Could not moderate listing:', updateError);
      Alert.alert('Listing not updated', 'Check the owner migration and try again.');
    } finally {
      setSavingListingId('');
    }
  };

  const loadMoreListings = async () => {
    if (!isPlatformOwner(user) || !hasMoreListings || loadingMoreListings) return;
    setLoadingMoreListings(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, listing_type, status, city, price, created_at')
        .order('created_at', { ascending: false })
        .range(listings.length, listings.length + 49);
      if (error) throw error;
      const nextListings = (data ?? []).map((row) => ({
        id: String(row.id),
        title: String(row.title),
        listing_type: row.listing_type === 'RENT' ? 'RENT' as const : 'SELL' as const,
        status: row.status === 'SOLD' || row.status === 'RENTED' ? row.status : 'ACTIVE' as const,
        city: String(row.city),
        price: Number(row.price),
        created_at: String(row.created_at),
      }));
      setListings((current) => [...current, ...nextListings]);
      setHasMoreListings(nextListings.length === 50);
    } catch (loadError) {
      console.error('[Becho] Could not load more listings:', loadError);
      Alert.alert('Listings not loaded', 'Try again in a moment.');
    } finally {
      setLoadingMoreListings(false);
    }
  };

  const publishAnnouncement = async () => {
    if (!user || !isPlatformOwner(user)) return;
    if (announcementTitle.trim().length < 3 || announcementBody.trim().length < 3) {
      Alert.alert('Announcement needs more detail', 'Add a title and message before publishing.');
      return;
    }

    setSavingAnnouncement(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title: announcementTitle.trim(),
          body: announcementBody.trim(),
          severity: announcementSeverity,
          created_by: user.id,
        })
        .select('id, title, body, severity, is_active')
        .single();
      if (error) throw error;

      setAnnouncements((current) => [
        {
          id: String(data.id),
          title: String(data.title),
          body: String(data.body),
          severity: data.severity,
          is_active: Boolean(data.is_active),
        },
        ...current,
      ]);
      setAnnouncementTitle('');
      setAnnouncementBody('');
    } catch (publishError) {
      console.error('[Becho] Could not publish announcement:', publishError);
      Alert.alert('Announcement not published', 'Apply the owner and announcements migration, then try again.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const toggleAnnouncement = async (announcement: Announcement) => {
    if (!isPlatformOwner(user)) return;
    const isActive = !announcement.is_active;
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: isActive })
        .eq('id', announcement.id);
      if (error) throw error;
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id ? { ...item, is_active: isActive } : item
        )
      );
    } catch (updateError) {
      console.error('[Becho] Could not update announcement:', updateError);
      Alert.alert('Announcement not updated', 'Check your owner permissions and try again.');
    }
  };

  if (!isPlatformOwner(user)) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b0f19] px-8">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <Ionicons name="lock-closed-outline" size={24} color="#f87171" />
        </View>
        <Text className="mt-4 text-lg font-bold text-white">Owner access required</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-gray-400">
          Platform controls are restricted to accounts with the trusted platform_owner role.
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
          }}
          className="mt-5 rounded-xl bg-[#1f2937] px-5 py-3"
        >
          <Text className="font-semibold text-white">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0b0f19]">
      <View className="flex-row items-center border-b border-white/10 bg-[#111827] px-4 py-4">
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
          }}
          className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#1f2937]"
          accessibilityLabel="Close platform controls"
        >
          <Ionicons name="arrow-back" size={19} color="white" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-white">Platform controls</Text>
          <Text className="mt-0.5 text-xs text-gray-400">Owner-only marketplace settings</Text>
        </View>
        <Ionicons name="shield-checkmark" size={21} color={BECHO_COLORS.primary} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <Text className="font-bold text-emerald-200">Protected controls</Text>
          <Text className="mt-1 text-xs leading-5 text-gray-300">
            Owner-only settings are stored in Supabase and shared across users.
          </Text>
        </View>

        {!!errorMessage && (
          <View className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
            <Text className="text-xs text-amber-200">{errorMessage}</Text>
          </View>
        )}

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
          </View>
        ) : (
          flags.map((flag) => (
            <View
              key={flag.key}
              className="mb-3 flex-row items-center rounded-2xl border border-white/10 bg-[#111827] p-4"
            >
              <View className="mr-3 flex-1">
                <Text className="font-bold text-white">{flag.title}</Text>
                <Text className="mt-1 text-xs leading-4 text-gray-400">{flag.description}</Text>
              </View>
              {savingKey === flag.key ? (
                <ActivityIndicator size="small" color={BECHO_COLORS.primary} />
              ) : (
                <Switch
                  value={flag.enabled}
                  onValueChange={(enabled) => void updateFlag(flag, enabled)}
                  trackColor={{ true: BECHO_COLORS.primary, false: '#374151' }}
                  thumbColor="#f9fafb"
                  accessibilityLabel={flag.title}
                />
              )}
            </View>
          ))
        )}

        <Text className="mb-2 mt-5 text-sm font-bold text-white">Marketplace announcements</Text>
        <Text className="mb-3 text-xs leading-5 text-gray-400">
          Published notices appear on the Explore feed and update live.
        </Text>
        <View className="mb-4 rounded-2xl border border-white/10 bg-[#111827] p-4">
          <TextInput
            value={announcementTitle}
            onChangeText={setAnnouncementTitle}
            placeholder="Announcement title"
            placeholderTextColor="#6b7280"
            maxLength={120}
            className="mb-3 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
          />
          <TextInput
            value={announcementBody}
            onChangeText={setAnnouncementBody}
            placeholder="What should everyone know?"
            placeholderTextColor="#6b7280"
            maxLength={1000}
            multiline
            className="mb-3 min-h-20 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
          />
          <View className="mb-3 flex-row">
            {(['info', 'success', 'warning', 'urgent'] as const).map((severity) => (
              <TouchableOpacity
                key={severity}
                onPress={() => setAnnouncementSeverity(severity)}
                className={`mr-2 rounded-full px-3 py-2 ${
                  announcementSeverity === severity ? 'bg-emerald-500/20' : 'bg-[#1f2937]'
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: announcementSeverity === severity }}
              >
                <Text
                  className={`text-xs font-semibold capitalize ${
                    announcementSeverity === severity ? 'text-emerald-300' : 'text-gray-400'
                  }`}
                >
                  {severity}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => void publishAnnouncement()}
            disabled={savingAnnouncement}
            className="min-h-11 flex-row items-center justify-center rounded-xl bg-emerald-500"
          >
            {savingAnnouncement && <ActivityIndicator size="small" color="#052e16" />}
            <Text className={`font-bold text-[#052e16] ${savingAnnouncement ? 'ml-2' : ''}`}>
              {savingAnnouncement ? 'Publishing…' : 'Publish announcement'}
            </Text>
          </TouchableOpacity>
        </View>
        {announcements.map((announcement) => (
          <View
            key={announcement.id}
            className="mb-2 flex-row items-center rounded-xl border border-white/10 bg-[#111827] p-3"
          >
            <View className="mr-3 flex-1">
              <Text className="font-semibold text-white">{announcement.title}</Text>
              <Text className="mt-1 text-xs text-gray-400" numberOfLines={2}>
                {announcement.body}
              </Text>
            </View>
            <Switch
              value={announcement.is_active}
              onValueChange={() => void toggleAnnouncement(announcement)}
              trackColor={{ true: BECHO_COLORS.primary, false: '#374151' }}
              thumbColor="#f9fafb"
              accessibilityLabel={`Announcement ${announcement.is_active ? 'active' : 'inactive'}`}
            />
          </View>
        ))}

        <Text className="mb-2 mt-5 text-sm font-bold text-white">All marketplace listings</Text>
        <Text className="mb-3 text-xs leading-5 text-gray-400">
          Review recent listings from every seller and control their availability.
        </Text>
        {listings.length === 0 ? (
          <View className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <Text className="text-sm text-gray-400">No listings have been published yet.</Text>
          </View>
        ) : (
          listings.map((listing) => (
            <View
              key={listing.id}
              className="mb-2 flex-row items-center rounded-xl border border-white/10 bg-[#111827] p-3"
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Ionicons
                  name={listing.listing_type === 'RENT' ? 'key-outline' : 'pricetag-outline'}
                  size={18}
                  color={BECHO_COLORS.primary}
                />
              </View>
              <View className="mr-3 flex-1">
                <Text className="font-semibold text-white" numberOfLines={1}>{listing.title}</Text>
                <Text className="mt-1 text-xs text-gray-400">
                  {listing.city} · ₹{listing.price.toLocaleString('en-IN')} · {listing.status}
                </Text>
              </View>
              {savingListingId === listing.id ? (
                <ActivityIndicator size="small" color={BECHO_COLORS.primary} />
              ) : (
                <TouchableOpacity
                  onPress={() => void updateListingStatus(listing)}
                  className={`rounded-lg px-3 py-2 ${
                    listing.status === 'ACTIVE' ? 'bg-amber-400/10' : 'bg-emerald-500/10'
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`${listing.status === 'ACTIVE' ? 'Mark unavailable' : 'Reactivate'} ${listing.title}`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      listing.status === 'ACTIVE' ? 'text-amber-200' : 'text-emerald-200'
                    }`}
                  >
                    {listing.status === 'ACTIVE' ? 'Mark unavailable' : 'Reactivate'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
        {hasMoreListings && (
          <TouchableOpacity
            onPress={() => void loadMoreListings()}
            disabled={loadingMoreListings}
            className="mb-3 min-h-11 flex-row items-center justify-center rounded-xl bg-[#1f2937]"
          >
            {loadingMoreListings && <ActivityIndicator size="small" color={BECHO_COLORS.primary} />}
            <Text className={`font-semibold text-white ${loadingMoreListings ? 'ml-2' : ''}`}>
              {loadingMoreListings ? 'Loading…' : 'Load more listings'}
            </Text>
          </TouchableOpacity>
        )}

        <Text className="mb-2 mt-5 text-sm font-bold text-white">Seller verification</Text>
        <Text className="mb-3 text-xs leading-5 text-gray-400">
          Review seller requests before granting a verified badge.
        </Text>
        {verificationRequests.length === 0 ? (
          <View className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <Text className="text-sm text-gray-400">No pending verification requests.</Text>
          </View>
        ) : (
          verificationRequests.map((request) => (
            <View
              key={request.user_id}
              className="mb-3 rounded-2xl border border-white/10 bg-[#111827] p-4"
            >
              <Text className="font-bold text-white">{request.full_name}</Text>
              <Text className="mt-1 text-xs text-gray-400">{request.city}</Text>
              <View className="mt-3 flex-row">
                <TouchableOpacity
                  onPress={() => void reviewSeller(request.user_id, 'rejected')}
                  className="mr-2 flex-1 items-center rounded-lg bg-[#1f2937] py-2.5"
                >
                  <Text className="text-xs font-semibold text-gray-300">Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void reviewSeller(request.user_id, 'verified')}
                  className="flex-1 items-center rounded-lg bg-emerald-500 py-2.5"
                >
                  <Text className="text-xs font-bold text-[#052e16]">Verify seller</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
