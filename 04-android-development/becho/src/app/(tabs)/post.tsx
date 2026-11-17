import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BechoLogoMark,
  HapticButton,
  NativeInput,
} from '../../components/NativeUI';
import { useAuth } from '../../lib/auth-context';
import { BECHO_CATEGORIES, RENT_PERIODS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

interface SelectedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function PostAdScreen() {
  const { user, profile } = useAuth();
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = theme.colors;

  const [listingType, setListingType] = useState<'SELL' | 'RENT'>('SELL');
  const [category, setCategory] = useState<string>(BECHO_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [rentPeriod, setRentPeriod] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');
  const [securityDeposit, setSecurityDeposit] = useState('');

  const [city, setCity] = useState('Chennai');
  const [locality, setLocality] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.city) {
      setCity(profile.city);
    }
  }, [profile?.city]);

  const handlePickPhotos = async () => {
    if (photos.length >= 5) {
      Alert.alert('Photo limit reached', 'You can upload up to 5 photos per ad.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload item photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const picked: SelectedPhoto[] = result.assets
        .filter((asset) => Boolean(asset.base64))
        .map((asset) => ({
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: asset.mimeType || 'image/jpeg',
        }));

      Haptics.selectionAsync().catch(() => {});
      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    }
  };

  const removePhoto = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDetectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location denied', 'You can still enter your city and area manually.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      if (place) {
        if (place.city || place.subregion) {
          setCity(place.city || place.subregion || city);
        }
        const area = place.district || place.name || place.street;
        if (area) {
          setLocality(area);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      Alert.alert('Location Error', err.message ?? 'Could not detect current location');
    } finally {
      setLocating(false);
    }
  };

  const uploadAllPhotos = async (userId: string): Promise<string[]> => {
    const publicUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = photo.mimeType.includes('png') ? 'png' : 'jpg';
      const filePath = `${userId}/${Date.now()}_${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(filePath, decode(photo.base64), {
          contentType: photo.mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('listing-images').getPublicUrl(filePath);
      publicUrls.push(data.publicUrl);
    }

    return publicUrls;
  };

  const handlePublishAd = async () => {
    if (!user) return;

    const numericPrice = Number(price);
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Enter a clear title for your item.');
      return;
    }
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid Price', 'Enter a valid amount greater than 0.');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Missing City', 'Enter the city where the item is located.');
      return;
    }

    setSubmitting(true);
    try {
      const uploadedUrls = photos.length > 0 ? await uploadAllPhotos(user.id) : [];

      const { error } = await supabase.from('listings').insert({
        seller_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        listing_type: listingType,
        category,
        price: numericPrice,
        rent_period: listingType === 'RENT' ? rentPeriod : null,
        security_deposit:
          listingType === 'RENT' && securityDeposit.trim()
            ? Number(securityDeposit) || 0
            : 0,
        city: city.trim(),
        locality: locality.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        images: uploadedUrls,
        status: 'ACTIVE',
      });

      if (error) throw error;

      setTitle('');
      setDescription('');
      setPrice('');
      setSecurityDeposit('');
      setPhotos([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      Alert.alert('Ad Published!', 'Your listing is now live on Becho.', [
        { text: 'View Feed', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Failed to Post Ad', err.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.page, { backgroundColor: c.bg }]}>
        <View style={styles.topStrip}>
          <View style={styles.brandRow}>
            <BechoLogoMark size={36} />
            <Text style={[styles.screenTitle, { color: c.text }]}>Post Ad</Text>
          </View>
        </View>
        <View style={styles.authGate}>
          <View
            style={[
              styles.gateIcon,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.xl,
                ...getCardElevation(theme),
              },
            ]}
          >
            <Ionicons name="add-circle-outline" size={40} color={c.primary} />
          </View>
          <Text style={[styles.gateTitle, { color: c.text }]}>Sign in to Post an Ad</Text>
          <Text style={[styles.gateSub, { color: c.textMuted }]}>
            List items for sale or rent in seconds and chat directly with local buyers.
          </Text>
          <HapticButton
            hapticStyle="medium"
            style={[
              styles.primaryBtn,
              {
                backgroundColor: c.primary,
                borderRadius: theme.radius.md,
                ...getCardElevation(theme),
              },
            ]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={[styles.primaryBtnText, { color: c.primaryText }]}>
              Go to Sign In
            </Text>
          </HapticButton>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 104 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* TOP BRAND HEADER */}
        <View style={styles.topStrip}>
          <View style={styles.brandRow}>
            <BechoLogoMark size={36} />
            <View>
              <Text style={[styles.screenTitle, { color: c.text }]}>Post an Ad</Text>
              <Text style={[styles.screenSub, { color: c.textMuted }]}>
                {listingType === 'SELL' ? 'Buy & Sell Marketplace' : 'Local Rental Listing'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.modeBadge,
              {
                backgroundColor: listingType === 'SELL' ? c.sellBadge : c.rentBadge,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Text
              style={[
                styles.modeBadgeText,
                { color: listingType === 'SELL' ? c.sellText : c.rentText },
              ]}
            >
              {listingType === 'SELL' ? 'SALE' : 'RENT'}
            </Text>
          </View>
        </View>

        {/* 1. LISTING TYPE SEGMENTED SWITCHER */}
        <View
          style={[
            styles.segmentTrack,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
          ]}
        >
          <HapticButton
            hapticStyle="selection"
            scaleTo={0.98}
            style={[
              styles.segmentBtn,
              {
                backgroundColor: listingType === 'SELL' ? c.sellBadge : 'transparent',
                borderRadius: theme.radius.md,
              },
            ]}
            onPress={() => setListingType('SELL')}
          >
            <Ionicons
              name="pricetag-outline"
              size={17}
              color={listingType === 'SELL' ? c.sellText : c.textMuted}
            />
            <Text
              style={[
                styles.segmentText,
                { color: listingType === 'SELL' ? c.sellText : c.textMuted },
              ]}
            >
              Sell Item
            </Text>
          </HapticButton>

          <HapticButton
            hapticStyle="selection"
            scaleTo={0.98}
            style={[
              styles.segmentBtn,
              {
                backgroundColor: listingType === 'RENT' ? c.rentBadge : 'transparent',
                borderRadius: theme.radius.md,
              },
            ]}
            onPress={() => setListingType('RENT')}
          >
            <Ionicons
              name="repeat-outline"
              size={17}
              color={listingType === 'RENT' ? c.rentText : c.textMuted}
            />
            <Text
              style={[
                styles.segmentText,
                { color: listingType === 'RENT' ? c.rentText : c.textMuted },
              ]}
            >
              Rent Out
            </Text>
          </HapticButton>
        </View>

        {/* 2. PHOTOS SURFACE BLOCK */}
        <View
          style={[
            styles.surfaceBlock,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>
              Photos ({photos.length}/5)
            </Text>
            <Text style={[styles.helperText, { color: c.textMuted }]}>
              First photo is cover
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photos.length < 5 && (
              <HapticButton
                hapticStyle="light"
                style={[
                  styles.addPhotoBox,
                  {
                    borderColor: c.primary,
                    backgroundColor: c.surfaceElevated,
                    borderRadius: theme.radius.lg,
                  },
                ]}
                onPress={handlePickPhotos}
              >
                <Ionicons name="camera-outline" size={26} color={c.primary} />
                <Text style={[styles.addPhotoText, { color: c.primary }]}>Add Photo</Text>
              </HapticButton>
            )}

            {photos.map((photo, index) => (
              <View
                key={photo.uri + index}
                style={[
                  styles.photoPreviewWrap,
                  {
                    backgroundColor: c.surfaceElevated,
                    borderRadius: theme.radius.lg,
                  },
                ]}
              >
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                {index === 0 && (
                  <View
                    style={[
                      styles.coverTag,
                      { backgroundColor: c.primary, borderRadius: theme.radius.sm },
                    ]}
                  >
                    <Text style={[styles.coverTagText, { color: c.primaryText }]}>
                      COVER
                    </Text>
                  </View>
                )}
                <HapticButton
                  hapticStyle="light"
                  style={[styles.removePhotoBtn, { backgroundColor: c.overlay }]}
                  onPress={() => removePhoto(index)}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </HapticButton>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* 3. CATEGORY BLOCK */}
        <View
          style={[
            styles.surfaceBlock,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: c.text, marginBottom: 10 }]}>
            Category
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {BECHO_CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <HapticButton
                  key={cat}
                  hapticStyle="selection"
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? c.primaryMuted : c.surfaceElevated,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      { color: active ? c.primary : c.textSecondary },
                    ]}
                  >
                    {cat}
                  </Text>
                </HapticButton>
              );
            })}
          </ScrollView>
        </View>

        {/* 4. DETAILS & PRICING FORM BLOCK */}
        <View
          style={[
            styles.surfaceBlock,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: c.text, marginBottom: 14 }]}>
            Listing Details
          </Text>

          <NativeInput
            label="Ad Title *"
            icon="create-outline"
            placeholder={
              listingType === 'SELL'
                ? 'e.g. iPhone 15 Pro 256GB - Mint Condition'
                : 'e.g. Sony A7 III Mirrorless Camera Kit'
            }
            value={title}
            onChangeText={setTitle}
            maxLength={90}
            containerStyle={styles.fieldSpacing}
          />

          <NativeInput
            label="Description"
            icon="document-text-outline"
            placeholder="Condition, age, accessories included, or rental terms..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.textAreaInput}
            containerStyle={styles.fieldSpacing}
          />

          <NativeInput
            label={listingType === 'SELL' ? 'Selling Price (₹) *' : 'Rent Rate (₹) *'}
            icon="cash-outline"
            placeholder={listingType === 'SELL' ? 'e.g. 45000' : 'e.g. 1200'}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
            containerStyle={listingType === 'RENT' ? styles.fieldSpacing : undefined}
          />

          {listingType === 'RENT' && (
            <>
              <View style={styles.fieldSpacing}>
                <Text style={[styles.fieldSubLabel, { color: c.textSecondary }]}>
                  Billing Period
                </Text>
                <View style={styles.periodRow}>
                  {RENT_PERIODS.map((p) => {
                    const active = rentPeriod === p.value;
                    return (
                      <HapticButton
                        key={p.value}
                        hapticStyle="selection"
                        style={[
                          styles.periodChip,
                          {
                            backgroundColor: active ? c.primaryMuted : c.surfaceElevated,
                            borderRadius: theme.radius.md,
                          },
                        ]}
                        onPress={() => setRentPeriod(p.value)}
                      >
                        <Text
                          style={[
                            styles.periodText,
                            { color: active ? c.primary : c.textMuted },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </HapticButton>
                    );
                  })}
                </View>
              </View>

              <NativeInput
                label="Refundable Security Deposit (₹)"
                icon="shield-checkmark-outline"
                placeholder="e.g. 3000"
                keyboardType="numeric"
                value={securityDeposit}
                onChangeText={setSecurityDeposit}
              />
            </>
          )}
        </View>

        {/* 5. LOCATION BLOCK */}
        <View
          style={[
            styles.surfaceBlock,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionLabel, { color: c.text }]}>Location</Text>
            <HapticButton
              hapticStyle="light"
              style={[
                styles.gpsBtn,
                {
                  backgroundColor: c.primaryMuted,
                  borderRadius: theme.radius.full,
                },
              ]}
              onPress={handleDetectLocation}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <>
                  <Ionicons name="locate" size={14} color={c.primary} />
                  <Text style={[styles.gpsBtnText, { color: c.primary }]}>Use GPS</Text>
                </>
              )}
            </HapticButton>
          </View>

          <View style={styles.locationRow}>
            <NativeInput
              label="City *"
              icon="business-outline"
              value={city}
              onChangeText={setCity}
              placeholder="Chennai"
              containerStyle={{ flex: 1 }}
            />
            <NativeInput
              label="Area"
              icon="location-outline"
              value={locality}
              onChangeText={setLocality}
              placeholder="Adyar"
              containerStyle={{ flex: 1 }}
            />
          </View>
        </View>

        {/* PUBLISH CTA */}
        <HapticButton
          hapticStyle="medium"
          style={[
            styles.publishBtn,
            {
              backgroundColor: c.primary,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
            submitting && { opacity: 0.7 },
          ]}
          onPress={handlePublishAd}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={c.primaryText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={21} color={c.primaryText} />
              <Text style={[styles.publishBtnText, { color: c.primaryText }]}>
                {listingType === 'SELL' ? 'Publish Sale Ad' : 'Publish Rental Ad'}
              </Text>
            </>
          )}
        </HapticButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  screenSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  modeBadge: { paddingHorizontal: 11, paddingVertical: 5 },
  modeBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  gateIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  gateTitle: { fontSize: 22, fontWeight: '900' },
  gateSub: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  primaryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  segmentTrack: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
  },
  segmentText: { fontSize: 14, fontWeight: '800' },
  surfaceBlock: {
    padding: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  helperText: { fontSize: 12, fontWeight: '600' },
  photoRow: { gap: 10 },
  addPhotoBox: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { fontSize: 12, fontWeight: '800' },
  photoPreviewWrap: { width: 96, height: 96, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  coverTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  coverTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },
  fieldSpacing: { marginBottom: 14 },
  textAreaInput: { minHeight: 88, paddingTop: 4 },
  fieldSubLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  periodText: { fontSize: 13, fontWeight: '800' },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  gpsBtnText: { fontSize: 12, fontWeight: '800' },
  locationRow: { flexDirection: 'row', gap: 10 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  publishBtnText: { fontSize: 16, fontWeight: '900' },
});