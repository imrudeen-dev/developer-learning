import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { BECHO_CATEGORIES, RENT_PERIODS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

interface SelectedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function PostAdScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();

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

      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    }
  };

  const removePhoto = (index: number) => {
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

      // Reset form
      setTitle('');
      setDescription('');
      setPrice('');
      setSecurityDeposit('');
      setPhotos([]);

      Alert.alert('Ad Published!', 'Your listing is now live on Becho.', [
        { text: 'View Feed', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Failed to Post Ad', err.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.authGate}>
        <View style={styles.gateIcon}>
          <Ionicons name="add-circle-outline" size={40} color={BECHO_COLORS.primary} />
        </View>
        <Text style={styles.gateTitle}>Sign in to Post an Ad</Text>
        <Text style={styles.gateSub}>
          List items for sale or rent in seconds and chat directly with local buyers.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Text style={styles.primaryBtnText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BECHO_COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 1. LISTING TYPE TOGGLE (SELL vs RENT) */}
        <Text style={styles.sectionLabel}>What would you like to do?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleChip,
              listingType === 'SELL' && styles.toggleChipSellActive,
            ]}
            onPress={() => setListingType('SELL')}
          >
            <Ionicons
              name="pricetag-outline"
              size={18}
              color={listingType === 'SELL' ? '#052E16' : BECHO_COLORS.text}
            />
            <Text
              style={[
                styles.toggleText,
                listingType === 'SELL' && styles.toggleTextActive,
              ]}
            >
              Sell Item
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleChip,
              listingType === 'RENT' && styles.toggleChipRentActive,
            ]}
            onPress={() => setListingType('RENT')}
          >
            <Ionicons
              name="repeat-outline"
              size={18}
              color={listingType === 'RENT' ? '#042F2E' : BECHO_COLORS.text}
            />
            <Text
              style={[
                styles.toggleText,
                listingType === 'RENT' && styles.toggleTextActive,
              ]}
            >
              Rent Out
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2. PHOTOS PICKER */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionLabel}>Photos ({photos.length}/5)</Text>
          <Text style={styles.helperText}>First photo becomes cover</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {photos.length < 5 && (
            <TouchableOpacity style={styles.addPhotoBox} onPress={handlePickPhotos}>
              <Ionicons name="camera-outline" size={28} color={BECHO_COLORS.primary} />
              <Text style={styles.addPhotoText}>Add Photos</Text>
            </TouchableOpacity>
          )}

          {photos.map((photo, index) => (
            <View key={photo.uri + index} style={styles.photoPreviewWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {/* 3. CATEGORY CHIPS */}
        <Text style={styles.sectionLabel}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {BECHO_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 4. TITLE & DESCRIPTION */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Ad Title *</Text>
          <TextInput
            style={styles.input}
            placeholder={
              listingType === 'SELL'
                ? 'e.g. iPhone 15 Pro 256GB - Mint Condition'
                : 'e.g. Sony A7 III Mirrorless Camera Kit for Rent'
            }
            placeholderTextColor={BECHO_COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={90}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Include condition, age, accessories included, or rental terms..."
            placeholderTextColor={BECHO_COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* 5. PRICING (ADAPTS TO SELL vs RENT) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            {listingType === 'SELL' ? 'Selling Price (₹) *' : 'Rent Rate (₹) *'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={listingType === 'SELL' ? 'e.g. 45000' : 'e.g. 1200'}
            placeholderTextColor={BECHO_COLORS.textMuted}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
        </View>

        {listingType === 'RENT' && (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Billing Period</Text>
              <View style={styles.periodRow}>
                {RENT_PERIODS.map((p) => {
                  const active = rentPeriod === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.periodChip, active && styles.periodChipActive]}
                      onPress={() => setRentPeriod(p.value)}
                    >
                      <Text style={[styles.periodText, active && styles.periodTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Refundable Security Deposit (₹) (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 3000"
                placeholderTextColor={BECHO_COLORS.textMuted}
                keyboardType="numeric"
                value={securityDeposit}
                onChangeText={setSecurityDeposit}
              />
            </View>
          </>
        )}

        {/* 6. LOCATION */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionLabel}>Location</Text>
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleDetectLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={BECHO_COLORS.primary} />
            ) : (
              <>
                <Ionicons name="locate-outline" size={16} color={BECHO_COLORS.primary} />
                <Text style={styles.gpsBtnText}>Use Current GPS</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.locationRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>City *</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Chennai"
              placeholderTextColor={BECHO_COLORS.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Neighborhood / Area</Text>
            <TextInput
              style={styles.input}
              value={locality}
              onChangeText={setLocality}
              placeholder="e.g. Adyar, Anna Nagar"
              placeholderTextColor={BECHO_COLORS.textMuted}
            />
          </View>
        </View>

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          style={[styles.publishBtn, submitting && { opacity: 0.7 }]}
          onPress={handlePublishAd}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#052E16" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#052E16" />
              <Text style={styles.publishBtnText}>
                {listingType === 'SELL' ? 'Publish Sale Ad' : 'Publish Rental Ad'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  authGate: {
    flex: 1,
    backgroundColor: BECHO_COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  gateIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  gateTitle: { color: BECHO_COLORS.text, fontSize: 22, fontWeight: '800' },
  gateSub: {
    color: BECHO_COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: BECHO_COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#052E16', fontSize: 15, fontWeight: '800' },
  sectionLabel: {
    color: BECHO_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  helperText: { color: BECHO_COLORS.textMuted, fontSize: 12 },
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
    borderRadius: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  toggleChipSellActive: {
    backgroundColor: BECHO_COLORS.primary,
    borderColor: BECHO_COLORS.primary,
  },
  toggleChipRentActive: {
    backgroundColor: BECHO_COLORS.rentBadge,
    borderColor: BECHO_COLORS.rentBadge,
  },
  toggleText: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700' },
  toggleTextActive: { color: '#052E16', fontWeight: '800' },
  photoRow: { gap: 10, paddingBottom: 16 },
  addPhotoBox: {
    width: 96,
    height: 96,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: BECHO_COLORS.primary,
    backgroundColor: BECHO_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { color: BECHO_COLORS.primary, fontSize: 12, fontWeight: '700' },
  photoPreviewWrap: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: 8, paddingBottom: 18 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: BECHO_COLORS.primaryMuted,
    borderColor: BECHO_COLORS.primary,
  },
  categoryText: { color: BECHO_COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: BECHO_COLORS.primary, fontWeight: '700' },
  fieldGroup: { marginBottom: 14 },
  label: { color: BECHO_COLORS.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: BECHO_COLORS.text,
    fontSize: 15,
  },
  textArea: { minHeight: 96, paddingTop: 12 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: BECHO_COLORS.primaryMuted,
    borderColor: BECHO_COLORS.primary,
  },
  periodText: { color: BECHO_COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: BECHO_COLORS.primary, fontWeight: '700' },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  gpsBtnText: { color: BECHO_COLORS.primary, fontSize: 12, fontWeight: '700' },
  locationRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 22 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BECHO_COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  publishBtnText: { color: '#052E16', fontSize: 16, fontWeight: '800' },
});