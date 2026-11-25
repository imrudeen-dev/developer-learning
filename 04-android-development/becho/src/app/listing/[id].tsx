import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Linking,
    Modal,
    Share,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { useAuth } from '../../lib/auth-context';
import { useAppPreferences } from '../../lib/app-preferences';
import {
  getListingMetrics,
  ListingMetrics,
  recordListingView,
  setListingLiked,
  setListingSaved,
} from '../../lib/marketplace';
import { Listing, formatINR, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { usePlatformSettings } from '../../lib/platform-settings';
import { BECHO_COLORS } from '../../lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

function getDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { theme, t } = useAppPreferences();
  const { settings } = usePlatformSettings();
  const translationRef = useRef(t);

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [metrics, setMetrics] = useState<ListingMetrics | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [featureWarning, setFeatureWarning] = useState('');
  const [sellerPhone, setSellerPhone] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distanceError, setDistanceError] = useState('');
  const [checkingDistance, setCheckingDistance] = useState(false);

  useEffect(() => {
    translationRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setSellerPhone(null);

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select(
          `
          id,
          seller_id,
          title,
          description,
          listing_type,
          category,
          price,
          rent_period,
          security_deposit,
          city,
          locality,
          latitude,
          longitude,
          images,
          status,
          created_at,
          profiles:seller_id (
            full_name,
            city
          )
        `
        )
        .eq('id', id)
        .single();

      if (!mounted) return;
      if (error || !data) {
        Alert.alert(
          translationRef.current('listingNotFound'),
          translationRef.current('listingMayRemoved')
        );
        if (router.canGoBack()) router.back();
        else router.replace('/');
        return;
      }
      setListing(data as unknown as Listing);
      setLoading(false);

      const { data: sellerSettings, error: sellerSettingsError } = await supabase
        .from('seller_settings')
        .select('show_phone, public_profile')
        .eq('user_id', data.seller_id)
        .maybeSingle();
      if (sellerSettingsError) {
        console.error('[Becho] Could not load seller contact preferences:', sellerSettingsError);
      } else if (sellerSettings?.show_phone && sellerSettings.public_profile) {
        const { data: phone, error: phoneError } = await supabase.rpc('get_public_seller_phone', {
          p_seller_id: data.seller_id,
        });
        if (phoneError) {
          console.error('[Becho] Could not load seller phone preference:', phoneError);
        } else if (mounted) {
          setSellerPhone(phone);
        }
      }

      if (user && user.id !== data.seller_id) {
        try {
          await recordListingView(data.id);
        } catch (viewError) {
          console.error('[Becho] Could not record listing view:', viewError);
        }
      }

      try {
        const listingMetrics = await getListingMetrics([data.id]);
        if (mounted) setMetrics(listingMetrics.get(data.id) ?? null);
      } catch (metricsError) {
        console.error('[Becho] Could not load listing activity:', metricsError);
        if (mounted) setFeatureWarning(translationRef.current('activityMigrationRequired'));
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, router, user]);

  useEffect(() => {
    let active = true;
    if (!user || !id) {
      setIsSaved(false);
      setIsLiked(false);
      return;
    }

    void Promise.all([
      supabase.from('saved_listings').select('listing_id').eq('user_id', user.id).eq('listing_id', id).maybeSingle(),
      supabase.from('listing_likes').select('listing_id').eq('user_id', user.id).eq('listing_id', id).maybeSingle(),
    ]).then(([saved, liked]) => {
      if (saved.error) throw saved.error;
      if (liked.error) throw liked.error;
      if (active) {
        setIsSaved(Boolean(saved.data));
        setIsLiked(Boolean(liked.data));
      }
    }).catch((loadError: unknown) => {
      console.error('[Becho] Could not load listing save/like state:', loadError);
      if (active) setFeatureWarning(t('saveLikeMigrationRequired'));
    });

    return () => {
      active = false;
    };
  }, [id, user, t]);

  useEffect(() => {
    if (!id) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`listing-activity-detail:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'listing_activity_counts',
          filter: `listing_id=eq.${id}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void getListingMetrics([id])
              .then((updatedMetrics) => setMetrics(updatedMetrics.get(id) ?? null))
              .catch((metricsError: unknown) => {
                console.error('[Becho] Could not refresh live listing activity:', metricsError);
                setFeatureWarning(t('liveActivityUnavailable'));
              });
          }, 120);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [id, t]);

  if (loading || !listing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
      </View>
    );
  }

  const isOwner = user?.id === listing.seller_id;
  const isRent = listing.listing_type === 'RENT';
  const locationLabel = [listing.locality, listing.city].filter(Boolean).join(', ');
  const sellerName = listing.profiles?.full_name || 'Becho Seller';

  const handleChatPress = () => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    router.push({
      pathname: '/chat/[listingId]',
      params: {
        listingId: listing.id,
        sellerId: listing.seller_id,
        title: listing.title,
      },
    });
  };

  const handleSavePress = async () => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    try {
      await setListingSaved(user.id, listing.id, !isSaved);
      setIsSaved((current) => !current);
    } catch (saveError) {
      console.error('[Becho] Could not save listing:', saveError);
      Alert.alert(t('saveListingFailed'), t('retryAfterMigration'));
    }
  };

  const handleLikePress = async () => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    try {
      await setListingLiked(user.id, listing.id, !isLiked);
      setIsLiked((current) => !current);
      const updatedMetrics = await getListingMetrics([listing.id]);
      setMetrics(updatedMetrics.get(listing.id) ?? null);
    } catch (likeError) {
      console.error('[Becho] Could not update listing like:', likeError);
      Alert.alert(t('likeListingFailed'), t('retryAfterMigration'));
    }
  };

  const handleSharePress = async () => {
    try {
      await Share.share({
        title: listing.title,
        message: `${listing.title} — ${formatListingPrice(listing)}\nbecho://listing/${listing.id}`,
      });
    } catch (shareError) {
      console.error('[Becho] Could not share listing:', shareError);
    }
  };

  const handleCallPress = async () => {
    if (!sellerPhone) {
      Alert.alert(t('phonePrivate'), t('sellerPrefersChat'));
      return;
    }
    try {
      await Linking.openURL(`tel:${sellerPhone}`);
    } catch (callError) {
      console.error('[Becho] Could not open phone dialer:', callError);
      Alert.alert(t('dialerUnavailable'), t('useChatContact'));
    }
  };

  const showDistance = async () => {
    if (listing.latitude === null || listing.longitude === null) {
      setDistanceError(t('locationNotShared'));
      return;
    }

    setCheckingDistance(true);
    setDistanceError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setDistanceError(t('locationPermissionNotGranted'));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setDistanceKm(
        getDistanceKm(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          { latitude: listing.latitude, longitude: listing.longitude }
        )
      );
    } catch (locationError) {
      console.error('[Becho] Could not calculate listing distance:', locationError);
      setDistanceError(t('couldNotGetLocation'));
    } finally {
      setCheckingDistance(false);
    }
  };

  const handleOfferPress = async () => {
    if (!settings.offers_enabled) {
      Alert.alert(t('offersPaused'), t('offersPausedHint'));
      return;
    }
    if (!user) {
      setOfferVisible(false);
      router.push('/(tabs)/profile');
      return;
    }
    const amount = Number(offerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(t('validOffer'), t('offerMustBePositive'));
      return;
    }

    setSubmittingOffer(true);
    try {
      const { error } = await supabase.from('offers').insert({
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        amount,
        message: offerMessage.trim() || null,
      });
      if (error) throw error;
      setOfferVisible(false);
      setOfferAmount('');
      setOfferMessage('');
      Alert.alert(t('offerSent'), t('sellerNotified'));
    } catch (offerError) {
      console.error('[Becho] Could not submit offer:', offerError);
      Alert.alert(t('sendOfferFailed'), t('retryAfterMigration'));
    } finally {
      setSubmittingOffer(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* TOP BAR */}
      <View style={[styles.topBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.background }]}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('goBack')}
        >
          <Ionicons name="arrow-back" size={22} color={BECHO_COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {t('adDetails')}
        </Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[styles.actionIcon, { backgroundColor: theme.background }]}
            onPress={handleSharePress}
            accessibilityRole="button"
            accessibilityLabel={t('shareListing')}
          >
            <Ionicons name="share-social-outline" size={18} color={BECHO_COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionIcon, { backgroundColor: theme.background }]}
            onPress={handleSavePress}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t('removeSavedListing') : t('saveListing')}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? theme.primary : BECHO_COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PHOTO CAROUSEL */}
        <View style={styles.carouselWrap}>
          {listing.images && listing.images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setActivePhotoIdx(idx);
                }}
              >
                {listing.images.map((uri, i) => (
                  <Image
                    key={uri + i}
                    source={{ uri }}
                    style={{ width: SCREEN_WIDTH, height: 280 }}
                  />
                ))}
              </ScrollView>
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>
                  {activePhotoIdx + 1} / {listing.images.length}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noPhotoBox}>
              <Ionicons name="image-outline" size={48} color={BECHO_COLORS.textMuted} />
              <Text style={styles.noPhotoText}>{t('noPhotos')}</Text>
            </View>
          )}
        </View>

        {/* MAIN DETAILS */}
        <View style={styles.body}>
          <View style={styles.tagRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isRent ? BECHO_COLORS.rentBadge : theme.primary },
              ]}
            >
              <Text style={styles.typeBadgeText}>{isRent ? t('forRent').toUpperCase() : t('forSale').toUpperCase()}</Text>
            </View>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>{listing.category}</Text>
            </View>
            {listing.status !== 'ACTIVE' && (
              <View style={styles.soldBadge}>
                <Text style={styles.soldBadgeText}>{listing.status === 'RENTED' ? t('rented').toUpperCase() : t('sold').toUpperCase()}</Text>
              </View>
            )}
            {metrics?.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: theme.primary }]}>
                <Ionicons name="checkmark-circle" size={12} color="#052E16" />
                <Text style={styles.verifiedBadgeText}>{t('verified')}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.price, { color: theme.primary }]}>{formatListingPrice(listing)}</Text>

          {isRent && (listing.security_deposit ?? 0) > 0 && (
            <Text style={styles.depositText}>
              {t('securityDeposit')}: {formatINR(listing.security_deposit!)}
            </Text>
          )}

          <Text style={styles.title}>{listing.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={theme.primary} />
            <Text style={styles.metaText}>{locationLabel || 'Chennai'}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.metaText}>{formatTimeAgo(listing.created_at)}</Text>
          </View>
          {listing.latitude !== null && listing.longitude !== null ? (
            <TouchableOpacity
              style={[
                styles.distanceButton,
                { borderColor: `${theme.primary}47`, backgroundColor: `${theme.primary}14` },
              ]}
              onPress={() => void showDistance()}
              disabled={checkingDistance}
              accessibilityRole="button"
              accessibilityLabel={t('calculateApproxDistance')}
            >
              {checkingDistance ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name="navigate-outline" size={16} color={theme.primary} />
              )}
              <Text style={[styles.distanceText, { color: theme.primary }]}>
                {checkingDistance
                  ? t('findingDistance')
                  : distanceKm === null
                    ? t('showDistanceFromMe')
                    : `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} ${t('away')}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.distanceUnavailable}>
              {t('distanceNoPreciseLocation')}
            </Text>
          )}
          {!!distanceError && <Text style={styles.distanceError}>{distanceError}</Text>}
          {distanceKm !== null && (
            <Text style={styles.distancePrivacy}>
              {t('distancePrivacyNotice')}
            </Text>
          )}
          <View style={styles.activityRow}>
            <TouchableOpacity style={styles.activityAction} onPress={() => void handleLikePress()}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={17} color={isLiked ? '#f87171' : BECHO_COLORS.textMuted} />
              <Text style={styles.activityText}>{metrics?.like_count ?? 0} {t('likes')}</Text>
            </TouchableOpacity>
            <View style={styles.activityAction}>
              <Ionicons name="eye-outline" size={17} color={BECHO_COLORS.textMuted} />
              <Text style={styles.activityText}>{metrics?.view_count ?? 0} {t('views')}</Text>
            </View>
            {Boolean(metrics?.review_count) && (
              <View style={styles.activityAction}>
                <Ionicons name="star" size={15} color="#fbbf24" />
                <Text style={styles.activityText}>
                  {metrics?.average_rating.toFixed(1)} ({metrics?.review_count})
                </Text>
              </View>
            )}
          </View>
          {!!featureWarning && <Text style={styles.featureWarning}>{featureWarning}</Text>}

          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>{t('description')}</Text>
          <Text style={styles.description}>
            {listing.description || t('noDescriptionProvided')}
          </Text>

          <View style={styles.divider} />

          {/* SELLER CARD */}
          <Text style={styles.sectionHeading}>{t('seller')}</Text>
          <View style={[styles.sellerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.sellerAvatar, { backgroundColor: `${theme.primary}26` }]}>
              <Text style={[styles.sellerInitial, { color: theme.primary }]}>{sellerName[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{sellerName}</Text>
              <Text style={styles.sellerSub}>
                {listing.profiles?.city || listing.city || 'Chennai'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* BOTTOM ACTION BAR */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
        ]}
      >
        {isOwner ? (
          <View style={[styles.ownerBanner, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="checkmark-circle" size={18} color={BECHO_COLORS.primary} />
            <Text style={styles.ownerBannerText}>{t('publishedByYou')}</Text>
          </View>
        ) : listing.status !== 'ACTIVE' ? (
          <View style={styles.ownerBanner}>
            <Ionicons name="information-circle-outline" size={18} color={BECHO_COLORS.textMuted} />
            <Text style={styles.ownerBannerText}>{t('listingUnavailable')}</Text>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            {sellerPhone && (
              <TouchableOpacity
                style={[
                  styles.secondaryAction,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
                onPress={() => void handleCallPress()}
              >
                <Ionicons name="call-outline" size={18} color={BECHO_COLORS.text} />
              </TouchableOpacity>
            )}
            {settings.offers_enabled && (
              <TouchableOpacity
                style={[styles.secondaryAction, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={() => setOfferVisible(true)}
              >
                <Text style={styles.offerButtonText}>{t('offer')}</Text>
              </TouchableOpacity>
            )}
            {settings.chat_enabled && (
              <TouchableOpacity style={[styles.chatBtn, { flex: 1, backgroundColor: theme.primary }]} onPress={handleChatPress}>
                <Ionicons name="chatbubble-ellipses-outline" size={19} color="#052E16" />
                <Text style={styles.chatBtnText}>{t('chatWithSeller')}</Text>
              </TouchableOpacity>
            )}
            {!settings.chat_enabled && !settings.offers_enabled && (
              <Text style={styles.ownerBannerText}>{t('contactUnavailable')}</Text>
            )}
          </View>
        )}
      </View>
      <Modal
        visible={offerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOfferVisible(false)}
      >
        <View style={styles.modalScrim}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setOfferVisible(false)} />
          <View style={[styles.offerSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.offerSheetHeader}>
              <View>
                <Text style={styles.offerTitle}>{t('makeAnOffer')}</Text>
                <Text style={styles.offerSubtitle} numberOfLines={1}>{listing.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setOfferVisible(false)} accessibilityLabel={t('closeOfferForm')}>
                <Ionicons name="close" size={22} color={BECHO_COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.offerLabel}>{t('yourOffer')}</Text>
            <TextInput
              value={offerAmount}
              onChangeText={setOfferAmount}
              keyboardType="decimal-pad"
              placeholder={String(listing.price)}
              placeholderTextColor={BECHO_COLORS.textMuted}
              style={[styles.offerInput, { backgroundColor: theme.background, borderColor: theme.border }]}
              accessibilityLabel={t('offerAmount')}
            />
            <Text style={styles.offerLabel}>{t('optionalMessage')}</Text>
            <TextInput
              value={offerMessage}
              onChangeText={setOfferMessage}
              placeholder={t('offerNotePlaceholder')}
              placeholderTextColor={BECHO_COLORS.textMuted}
              maxLength={300}
              style={[styles.offerInput, styles.offerMessageInput, { backgroundColor: theme.background, borderColor: theme.border }]}
              multiline
              accessibilityLabel={t('offerMessage')}
            />
            <TouchableOpacity
              style={[styles.submitOfferButton, { backgroundColor: theme.primary }]}
              onPress={() => void handleOfferPress()}
              disabled={submittingOffer}
            >
              {submittingOffer ? (
                <ActivityIndicator size="small" color="#052E16" />
              ) : (
                <Text style={styles.submitOfferText}>{t('sendOffer')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  centered: { flex: 1, backgroundColor: BECHO_COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: BECHO_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: BECHO_COLORS.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700', maxWidth: '70%' },
  topBarActions: { flexDirection: 'row', gap: 8 },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingBottom: 96 },
  carouselWrap: { width: SCREEN_WIDTH, height: 280, backgroundColor: BECHO_COLORS.surfaceElevated },
  noPhotoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noPhotoText: { color: BECHO_COLORS.textMuted, fontSize: 13 },
  photoCounter: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoCounterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  body: { padding: 16 },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { color: '#052E16', fontSize: 11, fontWeight: '900' },
  soldBadge: { backgroundColor: BECHO_COLORS.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  soldBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: BECHO_COLORS.primary,
  },
  verifiedBadgeText: { color: '#052E16', fontSize: 10, fontWeight: '800' },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  catBadgeText: { color: BECHO_COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  price: { color: BECHO_COLORS.primary, fontSize: 26, fontWeight: '900' },
  depositText: { color: BECHO_COLORS.textMuted, fontSize: 13, marginTop: 4 },
  title: { color: BECHO_COLORS.text, fontSize: 19, fontWeight: '700', marginTop: 8, lineHeight: 25 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: BECHO_COLORS.textMuted, fontSize: 13 },
  distanceButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.28)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  distanceText: { color: '#a7f3d0', fontSize: 12, fontWeight: '700' },
  distanceUnavailable: { color: BECHO_COLORS.textMuted, fontSize: 11, marginTop: 8 },
  distanceError: { color: '#fca5a5', fontSize: 11, marginTop: 7 },
  distancePrivacy: { color: BECHO_COLORS.textMuted, fontSize: 10, marginTop: 6 },
  dot: { color: BECHO_COLORS.textMuted },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  activityAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  activityText: { color: BECHO_COLORS.textMuted, fontSize: 12 },
  featureWarning: { color: '#FBBF24', fontSize: 11, lineHeight: 16, marginTop: 8 },
  divider: { height: 1, backgroundColor: BECHO_COLORS.border, marginVertical: 18 },
  sectionHeading: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  description: { color: BECHO_COLORS.text, fontSize: 14, lineHeight: 22, opacity: 0.9 },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    padding: 14,
    borderRadius: 14,
  },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BECHO_COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { color: BECHO_COLORS.primary, fontSize: 18, fontWeight: '800' },
  sellerName: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700' },
  sellerSub: { color: BECHO_COLORS.textMuted, fontSize: 12, marginTop: 2 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: BECHO_COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: BECHO_COLORS.border,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BECHO_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  chatBtnText: { color: '#052E16', fontSize: 15, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryAction: {
    minWidth: 46,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  offerButtonText: { color: BECHO_COLORS.text, fontWeight: '700', fontSize: 13 },
  ownerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  ownerBannerText: { color: BECHO_COLORS.text, fontSize: 14, fontWeight: '700' },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  offerSheet: {
    backgroundColor: BECHO_COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: BECHO_COLORS.border,
    padding: 20,
    paddingBottom: 32,
  },
  offerSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  offerTitle: { color: BECHO_COLORS.text, fontSize: 18, fontWeight: '800' },
  offerSubtitle: { color: BECHO_COLORS.textMuted, fontSize: 12, marginTop: 3, maxWidth: 280 },
  offerLabel: { color: BECHO_COLORS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  offerInput: {
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: BECHO_COLORS.text,
    fontSize: 15,
    marginBottom: 16,
  },
  offerMessageInput: { minHeight: 78, textAlignVertical: 'top' },
  submitOfferButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BECHO_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOfferText: { color: '#052E16', fontSize: 14, fontWeight: '800' },
});