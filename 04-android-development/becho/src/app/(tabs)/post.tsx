import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { isPlatformOwner, useAuth } from '../../lib/auth-context';
import { BECHO_CATEGORIES, RENT_PERIODS } from '../../lib/constants';
import { usePlatformSettings } from '../../lib/platform-settings';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

interface SelectedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

const steps = ['Details', 'Photos & location', 'Review'];

export default function PostListingScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { settings } = usePlatformSettings();
  const params = useLocalSearchParams<{
    type?: string;
    title?: string;
    price?: string;
    category?: string;
  }>();
  const [step, setStep] = useState(0);
  const [listingType, setListingType] = useState<'SELL' | 'RENT'>(
    params.type === 'RENT' ? 'RENT' : 'SELL'
  );
  const [category, setCategory] = useState<string>(
    BECHO_CATEGORIES.includes(params.category as (typeof BECHO_CATEGORIES)[number])
      ? (params.category as string)
      : BECHO_CATEGORIES[0]
  );
  const [title, setTitle] = useState(params.title ?? '');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(params.price ?? '');
  const [rentPeriod, setRentPeriod] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [city, setCity] = useState(profile?.city ?? 'Chennai');
  const [locality, setLocality] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.city) setCity(profile.city);
  }, [profile?.city]);

  useEffect(() => {
    if (!settings.rentals_enabled && listingType === 'RENT') setListingType('SELL');
  }, [settings.rentals_enabled, listingType]);

  const pickPhotos = async () => {
    if (photos.length >= 5) {
      Alert.alert('Photo limit reached', 'Add up to five photos to show your item clearly.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to add listing photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
      quality: 0.75,
      base64: true,
    });

    if (!result.canceled) {
      const selected = result.assets
        .filter((asset): asset is typeof asset & { base64: string } => Boolean(asset.base64))
        .map((asset) => ({
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType || 'image/jpeg',
        }));
      setPhotos((current) => [...current, ...selected].slice(0, 5));
    }
  };

  const detectLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location not shared', 'You can enter your city and neighborhood manually.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (place) {
        setCity(place.city || place.subregion || city);
        setLocality(place.district || place.name || place.street || '');
      }
    } catch (locationError) {
      console.error('[Becho] Could not detect listing location:', locationError);
      Alert.alert('Location unavailable', 'Enter your city and neighborhood manually.');
    } finally {
      setLocating(false);
    }
  };

  const validateStep = () => {
    if (step === 0) {
      const numericPrice = Number(price);
      if (title.trim().length < 4) {
        Alert.alert('Add a clear title', 'Use at least four characters to describe your item.');
        return false;
      }
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        Alert.alert('Check the price', 'Enter an amount greater than zero.');
        return false;
      }
    }
    if (step === 1 && !city.trim()) {
      Alert.alert('Add a location', 'Enter the city where the item is available.');
      return false;
    }
    if (step === 0 && listingType === 'RENT' && securityDeposit.trim()) {
      const deposit = Number(securityDeposit);
      if (!Number.isFinite(deposit) || deposit < 0) {
        Alert.alert('Check the deposit', 'Enter a valid refundable deposit amount.');
        return false;
      }
    }
    return true;
  };

  const publishListing = async () => {
    if (!user || submitting) return;
    if (!settings.allow_listings && !isPlatformOwner(user)) {
      Alert.alert('Listings paused', 'The platform is not accepting new listings right now.');
      return;
    }
    if (listingType === 'RENT' && !settings.rentals_enabled) {
      Alert.alert('Rentals paused', 'The platform is not accepting rental listings right now.');
      return;
    }
    if (!city.trim() || !title.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      Alert.alert('Listing needs attention', 'Check the title, price, and city before publishing.');
      setStep(0);
      return;
    }

    setSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      if (settings.require_verified_sellers) {
        const { data: verification, error: verificationError } = await supabase
          .from('verified_sellers')
          .select('status')
          .eq('user_id', user.id)
          .maybeSingle();
        if (verificationError) throw verificationError;
        if (verification?.status !== 'verified' && !isPlatformOwner(user)) {
          Alert.alert(
            'Seller verification required',
            'Complete seller verification before publishing while this platform requirement is enabled.'
          );
          return;
        }
      }

      const imageUrls: string[] = [];
      for (const [index, photo] of photos.entries()) {
        const extension = photo.mimeType.includes('png') ? 'png' : 'jpg';
        const path = `${user.id}/${Date.now()}_${index}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(path, decode(photo.base64), {
            contentType: photo.mimeType,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        imageUrls.push(supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl);
      }

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          listing_type: listingType,
          category,
          price: Number(price),
          rent_period: listingType === 'RENT' ? rentPeriod : null,
          security_deposit:
            listingType === 'RENT' && securityDeposit.trim()
              ? Number(securityDeposit)
              : 0,
          city: city.trim(),
          locality: locality.trim() || null,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          images: imageUrls,
          status: 'ACTIVE',
        })
        .select('id')
        .single();

      if (error) throw error;
      router.replace(`/listing/${data.id}`);
    } catch (publishError) {
      console.warn('[Becho] Could not publish listing:', publishError);
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage
          .from('listing-images')
          .remove(uploadedPaths);
        if (cleanupError) {
          console.error('[Becho] Could not clean up uploaded listing photos:', cleanupError);
        }
      }

      const message =
        publishError && typeof publishError === 'object' && 'message' in publishError
          ? String((publishError as { message?: string }).message)
          : publishError instanceof Error
            ? publishError.message
            : 'Please try again in a moment.';
      const code =
        publishError && typeof publishError === 'object' && 'code' in publishError
          ? String((publishError as { code?: string }).code)
          : '';
      const hint =
        /bucket|storage|not found|row-level security|permission|policy/i.test(message)
          ? '\n\nCheck that the listing-images storage bucket exists and RLS policies allow upload/insert on the becho-dev project.'
          : /jwt|auth|session/i.test(message)
            ? '\n\nSign out and sign in again, then retry.'
            : '';

      Alert.alert(
        'Could not publish listing',
        code ? `${message} [${code}]${hint}` : `${message}${hint}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b0f19] px-8">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
          <Ionicons name="storefront-outline" size={30} color={BECHO_COLORS.primary} />
        </View>
        <Text className="mt-5 text-xl font-bold text-white">Sell or rent with Becho</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-gray-400">
          Sign in to publish a listing and talk directly with local buyers.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          className="mt-6 rounded-xl bg-emerald-500 px-6 py-3"
        >
          <Text className="font-bold text-[#052e16]">Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!settings.allow_listings && !isPlatformOwner(user)) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b0f19] px-8">
        <Ionicons name="pause-circle-outline" size={40} color={BECHO_COLORS.textMuted} />
        <Text className="mt-4 text-lg font-bold text-white">New listings are paused</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-gray-400">
          You can still browse the marketplace. Check back soon to list an item.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#0b0f19]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-white">Create a listing</Text>
            <Text className="mt-1 text-sm text-gray-400">A few details help buyers decide.</Text>
          </View>
          <View className="rounded-full bg-[#1f2937] px-3 py-2">
            <Text className="text-xs font-semibold text-gray-300">{step + 1} of 3</Text>
          </View>
        </View>

        <View className="mb-6 flex-row">
          {steps.map((label, index) => (
            <View key={label} className="mr-2 flex-1">
              <View className={`h-1 rounded-full ${index <= step ? 'bg-emerald-500' : 'bg-[#1f2937]'}`} />
              <Text className={`mt-2 text-[10px] ${index === step ? 'text-emerald-300' : 'text-gray-500'}`}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {step === 0 && (
          <View className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <Text className="mb-2 text-sm font-bold text-white">What are you listing?</Text>
            <View className="mb-5 flex-row rounded-xl bg-[#1f2937] p-1">
              {([
                ['SELL', 'Sell'],
                ...(settings.rentals_enabled ? [['RENT', 'Rent'] as const] : []),
              ] as const).map(([type, label]) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setListingType(type)}
                  className={`mr-1 flex-1 items-center rounded-lg py-2.5 ${
                    listingType === type ? 'bg-emerald-500' : ''
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: listingType === type }}
                >
                  <Text className={`text-sm font-bold ${listingType === type ? 'text-[#052e16]' : 'text-gray-300'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="mb-2 text-xs font-semibold text-gray-300">Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {BECHO_CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setCategory(item)}
                  className={`mr-2 rounded-full border px-3 py-2 ${
                    category === item ? 'border-emerald-500 bg-emerald-500/15' : 'border-white/10'
                  }`}
                >
                  <Text className={`text-xs ${category === item ? 'text-emerald-300' : 'text-gray-400'}`}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text className="mb-2 text-xs font-semibold text-gray-300">Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Example: iPhone 15 Pro, excellent condition"
              placeholderTextColor={BECHO_COLORS.textMuted}
              maxLength={90}
              className="mb-4 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              accessibilityLabel="Listing title"
            />
            <Text className="mb-2 text-xs font-semibold text-gray-300">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Condition, age, included accessories, or rental terms…"
              placeholderTextColor={BECHO_COLORS.textMuted}
              multiline
              maxLength={1200}
              textAlignVertical="top"
              className="mb-4 min-h-28 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              accessibilityLabel="Listing description"
            />
            <Text className="mb-2 text-xs font-semibold text-gray-300">
              {listingType === 'SELL' ? 'Price (₹)' : 'Rent per period (₹)'}
            </Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              placeholderTextColor={BECHO_COLORS.textMuted}
              keyboardType="decimal-pad"
              className="rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              accessibilityLabel="Price"
            />
            {listingType === 'RENT' && (
              <>
                <Text className="mb-2 mt-4 text-xs font-semibold text-gray-300">Billing period</Text>
                <View className="flex-row">
                  {RENT_PERIODS.map((period) => (
                    <TouchableOpacity
                      key={period.value}
                      onPress={() => setRentPeriod(period.value)}
                      className={`mr-2 rounded-full border px-3 py-2 ${
                        rentPeriod === period.value
                          ? 'border-sky-400 bg-sky-400/15'
                          : 'border-white/10'
                      }`}
                    >
                      <Text className={`text-xs ${rentPeriod === period.value ? 'text-sky-300' : 'text-gray-400'}`}>
                        {period.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="mb-2 mt-4 text-xs font-semibold text-gray-300">Security deposit (optional)</Text>
                <TextInput
                  value={securityDeposit}
                  onChangeText={setSecurityDeposit}
                  placeholder="0"
                  placeholderTextColor={BECHO_COLORS.textMuted}
                  keyboardType="decimal-pad"
                  className="rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
                  accessibilityLabel="Security deposit"
                />
              </>
            )}
          </View>
        )}

        {step === 1 && (
          <View className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-white">Photos</Text>
              <Text className="text-xs text-gray-500">{photos.length}/5</Text>
            </View>
            <Text className="mb-3 text-xs leading-5 text-gray-400">
              Add clear photos from different angles. The first photo is the cover.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
              <TouchableOpacity
                onPress={() => void pickPhotos()}
                className="mr-3 h-24 w-24 items-center justify-center rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5"
              >
                <Ionicons name="camera-outline" size={24} color={BECHO_COLORS.primary} />
                <Text className="mt-1 text-[10px] font-semibold text-emerald-300">Add photos</Text>
              </TouchableOpacity>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} className="mr-3 h-24 w-24 overflow-hidden rounded-xl">
                  <Image source={{ uri: photo.uri }} className="h-full w-full" resizeMode="cover" />
                  <TouchableOpacity
                    onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/70"
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-white">Pickup location</Text>
              <TouchableOpacity
                onPress={() => void detectLocation()}
                disabled={locating}
                className="flex-row items-center rounded-full bg-emerald-500/10 px-3 py-2"
              >
                {locating ? (
                  <ActivityIndicator size="small" color={BECHO_COLORS.primary} />
                ) : (
                  <>
                    <Ionicons name="locate-outline" size={15} color={BECHO_COLORS.primary} />
                    <Text className="ml-1 text-xs font-semibold text-emerald-300">Use GPS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={BECHO_COLORS.textMuted}
              className="mb-3 rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              accessibilityLabel="City"
            />
            <TextInput
              value={locality}
              onChangeText={setLocality}
              placeholder="Neighborhood or area"
              placeholderTextColor={BECHO_COLORS.textMuted}
              className="rounded-xl border border-white/10 bg-[#1f2937] px-3 py-3 text-white"
              accessibilityLabel="Neighborhood"
            />
          </View>
        )}

        {step === 2 && (
          <View className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <Text className="text-base font-bold text-white">Ready to publish?</Text>
            <Text className="mb-4 mt-1 text-sm text-gray-400">
              Check your details before your listing goes live.
            </Text>
            {photos[0] && (
              <Image source={{ uri: photos[0].uri }} className="mb-4 h-48 w-full rounded-xl" resizeMode="cover" />
            )}
            <Text className="text-lg font-extrabold text-emerald-400">
              ₹{Number(price || 0).toLocaleString('en-IN')}
              {listingType === 'RENT' ? ` / ${rentPeriod.toLowerCase()}` : ''}
            </Text>
            <Text className="mt-1 text-base font-bold text-white">{title || 'Your listing title'}</Text>
            <Text className="mt-2 text-xs text-gray-400">{category} · {city || 'Add city'}</Text>
            <Text className="mt-3 text-sm leading-5 text-gray-300">
              {description || 'No description added.'}
            </Text>
            <View className="mt-4 flex-row items-center rounded-xl bg-emerald-500/10 p-3">
              <Ionicons name="shield-checkmark-outline" size={17} color={BECHO_COLORS.primary} />
              <Text className="ml-2 flex-1 text-xs leading-4 text-emerald-200">
                Keep conversations and payments on trusted channels. Never share verification codes.
              </Text>
            </View>
          </View>
        )}

        <View className="mt-5 flex-row">
          {step > 0 && (
            <TouchableOpacity
              onPress={() => setStep((current) => current - 1)}
              className="mr-3 flex-1 items-center rounded-xl border border-white/15 py-3.5"
            >
              <Text className="font-semibold text-gray-300">Back</Text>
            </TouchableOpacity>
          )}
          {step < 2 ? (
            <TouchableOpacity
              onPress={() => {
                if (validateStep()) setStep((current) => current + 1);
              }}
              className="flex-1 items-center rounded-xl bg-emerald-500 py-3.5"
            >
              <Text className="font-bold text-[#052e16]">Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => void publishListing()}
              disabled={submitting}
              className="flex-1 flex-row items-center justify-center rounded-xl bg-emerald-500 py-3.5"
            >
              {submitting && <ActivityIndicator size="small" color="#052e16" />}
              <Text className={`font-bold text-[#052e16] ${submitting ? 'ml-2' : ''}`}>
                {submitting ? 'Publishing…' : 'Publish listing'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
