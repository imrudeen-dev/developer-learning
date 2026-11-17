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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BechoLogoMark, HapticButton, ScreenHeader } from '../../components/NativeUI';
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
        <ScreenHeader
          title="Post an Ad"
          subtitle="Sell or rent locally"
          leftAction={<BechoLogoMark size={34} />}
        />
        <View style={styles.authGate}>
          <View
            style={[
              styles.gateIcon,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
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
              { backgroundColor: c.primary, borderRadius: theme.radius.md },
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Post an Ad"
        subtitle={listingType === 'SELL' ? 'Marketplace Sale Listing' : 'Rental Listing'}
        leftAction={<BechoLogoMark size={34} />}
      />

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 44 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. LISTING TYPE TOGGLE (SELL vs RENT) */}
        <Text style={[styles.sectionLabel, { color: c.text }]}>
          What would you like to do?
        </Text>
        <View style={styles.toggleRow}>
          <HapticButton
            hapticStyle="selection"
            style={[
              styles.toggleChip,
              {
                backgroundColor: listingType === 'SELL' ? c.sellBadge : c.surface,
                borderColor: listingType === 'SELL' ? c.sellBadge : c.border,
                borderRadius: theme.radius.md,
              },
            ]}
            onPress={() => setListingType('SELL')}
          >
            <Ionicons
              name="pricetag-outline"
              size={18}
              color={listingType === 'SELL' ? c.sellText : c.text}
            />
            <Text
              style={[
                styles.toggleText,
                { color: listingType === 'SELL' ? c.sellText : c.text },
              ]}
            >
              Sell Item
            </Text>
          </HapticButton>

          <HapticButton
            hapticStyle="selection"
            style={[
              styles.toggleChip,
              {
                backgroundColor: listingType === 'RENT' ? c.rentBadge : c.surface,
                borderColor: listingType === 'RENT' ? c.rentBadge : c.border,
                borderRadius: theme.radius.md,
              },
            ]}
            onPress={() => setListingType('RENT')}
          >
            <Ionicons
              name="repeat-outline"
              size={18}
              color={listingType === 'RENT' ? c.rentText : c.text}
            />
            <Text
              style={[
                styles.toggleText,
                { color: listingType === 'RENT' ? c.rentText : c.text },
              ]}
            >
              Rent Out
            </Text>
          </HapticButton>
        </View>

        {/* 2. PHOTOS PICKER */}
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>
            Photos ({photos.length}/5)
          </Text>
          <Text style={[styles.helperText, { color: c.textMuted }]}>
            First photo becomes cover
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
                  backgroundColor: c.surface,
                  borderRadius: theme.radius.lg,
                },
              ]}
              onPress={handlePickPhotos}
            >
              <Ionicons name="camera-outline" size={28} color={c.primary} />
              <Text style={[styles.addPhotoText, { color: c.primary }]}>Add Photos</Text>
            </HapticButton>
          )}

          {photos.map((photo, index) => (
            <View
              key={photo.uri + index}
              style={[
                styles.photoPreviewWrap,
                {
                  borderRadius: theme.radius.lg,
                  borderColor: c.border,
                },
              ]}
            >
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
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

        {/* 3. CATEGORY CHIPS */}
        <Text style={[styles.sectionLabel, { color: c.text }]}>Category</Text>
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
                    backgroundColor: active ? c.primaryMuted : c.surface,
                    borderColor: active ? c.primary : c.border,
                    borderRadius: theme.radius.full,
                  },
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    { color: active ? c.primary : c.textMuted },
                  ]}
                >
                  {cat}
                </Text>
              </HapticButton>
            );
          })}
        </ScrollView>

        {/* 4. TITLE & DESCRIPTION */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.textMuted }]}>Ad Title *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.md,
                color: c.text,
              },
            ]}
            placeholder={
              listingType === 'SELL'
                ? 'e.g. iPhone 15 Pro 256GB - Mint Condition'
                : 'e.g. Sony A7 III Mirrorless Camera Kit for Rent'
            }
            placeholderTextColor={c.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={90}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.textMuted }]}>Description</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.md,
                color: c.text,
              },
            ]}
            placeholder="Include condition, age, accessories included, or rental terms..."
            placeholderTextColor={c.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* 5. PRICING (ADAPTS TO SELL vs RENT) */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: c.textMuted }]}>
            {listingType === 'SELL' ? 'Selling Price (₹) *' : 'Rent Rate (₹) *'}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.md,
                color: c.text,
              },
            ]}
            placeholder={listingType === 'SELL' ? 'e.g. 45000' : 'e.g. 1200'}
            placeholderTextColor={c.textMuted}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
        </View>

        {listingType === 'RENT' && (
          <>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textMuted }]}>Billing Period</Text>
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
                          backgroundColor: active ? c.primaryMuted : c.surface,
                          borderColor: active ? c.primary : c.border,
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

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textMuted }]}>
                Refundable Security Deposit (₹) (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.surfaceElevated,
                    borderColor: c.border,
                    borderRadius: theme.radius.md,
                    color: c.text,
                  },
                ]}
                placeholder="e.g. 3000"
                placeholderTextColor={c.textMuted}
                keyboardType="numeric"
                value={securityDeposit}
                onChangeText={setSecurityDeposit}
              />
            </View>
          </>
        )}

        {/* 6. LOCATION */}
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>Location</Text>
          <HapticButton
            hapticStyle="light"
            style={[
              styles.gpsBtn,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.sm,
              },
            ]}
            onPress={handleDetectLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <>
                <Ionicons name="locate-outline" size={16} color={c.primary} />
                <Text style={[styles.gpsBtnText, { color: c.primary }]}>
                  Use Current GPS
                </Text>
              </>
            )}
          </HapticButton>
        </View>

        <View style={styles.locationRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: c.textMuted }]}>City *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  borderRadius: theme.radius.md,
                  color: c.text,
                },
              ]}
              value={city}
              onChangeText={setCity}
              placeholder="Chennai"
              placeholderTextColor={c.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: c.textMuted }]}>
              Neighborhood / Area
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  borderRadius: theme.radius.md,
                  color: c.text,
                },
              ]}
              value={locality}
              onChangeText={setLocality}
              placeholder="e.g. Adyar, Anna Nagar"
              placeholderTextColor={c.textMuted}
            />
          </View>
        </View>

        {/* SUBMIT BUTTON */}
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
              <Ionicons name="checkmark-circle-outline" size={20} color={c.primaryText} />
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
  container: { padding: 16 },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  gateIcon: {
    width: 72,
    height: 72,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  gateTitle: { fontSize: 22, fontWeight: '800' },
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
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  helperText: { fontSize: 12 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  toggleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderWidth: 1,
  },
  toggleText: { fontSize: 15, fontWeight: '800' },
  photoRow: { gap: 10, paddingBottom: 16 },
  addPhotoBox: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { fontSize: 12, fontWeight: '700' },
  photoPreviewWrap: { width: 96, height: 96, overflow: 'hidden', borderWidth: 1 },
  photoPreview: { width: '100%', height: '100%' },
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
  chipRow: { gap: 8, paddingBottom: 18 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontWeight: '700' },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { minHeight: 96, paddingTop: 12 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodText: { fontSize: 13, fontWeight: '700' },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  gpsBtnText: { fontSize: 12, fontWeight: '700' },
  locationRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 22 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  publishBtnText: { fontSize: 16, fontWeight: '800' },
});