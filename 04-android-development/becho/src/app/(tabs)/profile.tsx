import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Listing, formatListingPrice } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { BECHO_THEMES, ThemeId, getCardElevation, useBechoTheme } from '../../lib/theme';

export default function ProfileScreen() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { theme, themeId, setThemeId } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = theme.colors;

  // Auth form state
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('Chennai');
  const [savingProfile, setSavingProfile] = useState(false);

  // My Ads state
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [busyAdId, setBusyAdId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setEditName(profile.full_name ?? '');
      setEditPhone(profile.phone ?? '');
      setEditCity(profile.city ?? 'Chennai');
    }
  }, [profile]);

  const loadMyListings = useCallback(async () => {
    if (!user) {
      setMyListings([]);
      return;
    }
    setLoadingAds(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyListings((data as Listing[]) ?? []);
    } catch (err) {
      console.error('[Becho] Failed to fetch user listings:', err);
    } finally {
      setLoadingAds(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadMyListings();
    }, [loadMyListings])
  );

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    if (isSignUp && !fullName.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Welcome to Becho!', 'Your account has been created.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Authentication Error', err.message ?? 'Something went wrong');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName.trim(),
          phone: editPhone.trim(),
          city: editCity.trim() || 'Chennai',
        })
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved', 'Your profile details have been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message ?? 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleAdStatus = async (item: Listing) => {
    const nextStatus: Listing['status'] =
      item.status === 'ACTIVE'
        ? item.listing_type === 'RENT'
          ? 'RENTED'
          : 'SOLD'
        : 'ACTIVE';

    setBusyAdId(item.id);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status: nextStatus })
        .eq('id', item.id);

      if (error) throw error;
      Haptics.selectionAsync().catch(() => {});
      setMyListings((prev) =>
        prev.map((ad) => (ad.id === item.id ? { ...ad, status: nextStatus } : ad))
      );
    } catch (err: any) {
      Alert.alert('Status Update Failed', err.message ?? 'Could not update listing status');
    } finally {
      setBusyAdId(null);
    }
  };

  const handleDeleteAd = (item: Listing) => {
    Alert.alert(
      'Delete Listing?',
      `Remove "${item.title}" permanently? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyAdId(item.id);
            try {
              if (item.images && item.images.length > 0) {
                const storagePaths = item.images
                  .map((url) => url.split('/listing-images/')[1])
                  .filter(Boolean);
                if (storagePaths.length > 0) {
                  await supabase.storage.from('listing-images').remove(storagePaths);
                }
              }

              const { error } = await supabase.from('listings').delete().eq('id', item.id);
              if (error) throw error;

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              setMyListings((prev) => prev.filter((ad) => ad.id !== item.id));
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message ?? 'Could not delete listing');
            } finally {
              setBusyAdId(null);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await supabase.auth.signOut();
  };

  const renderThemeCard = () => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderRadius: theme.radius.lg,
          ...getCardElevation(theme),
        },
      ]}
    >
      <View style={[styles.rowBetween, { marginBottom: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: c.text, marginBottom: 2 }]}>
            Appearance & Theme
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>
            Live Android surface & accent tokens
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: theme.radius.full,
            backgroundColor: c.primaryMuted,
          }}
        >
          <Text style={{ color: c.primary, fontSize: 11, fontWeight: '700' }}>
            {theme.name}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {(Object.keys(BECHO_THEMES) as ThemeId[]).map((id) => {
          const item = BECHO_THEMES[id];
          const active = themeId === id;
          return (
            <HapticButton
              key={id}
              hapticStyle="selection"
              onPress={() => setThemeId(id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                backgroundColor: active ? c.primaryMuted : c.surfaceElevated,
                borderColor: active ? c.primary : c.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: item.colors.primary,
                    borderWidth: 2,
                    borderColor: item.colors.bg,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                    {item.name}
                  </Text>
                  <Text
                    style={{ color: c.textMuted, fontSize: 11, marginTop: 1 }}
                    numberOfLines={1}
                  >
                    {item.tagline}
                  </Text>
                </View>
              </View>

              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={active ? c.primary : c.textMuted}
              />
            </HapticButton>
          );
        })}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  // LOGGED-OUT VIEW
  if (!user) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title="Account"
          subtitle="Sign in to post & manage ads"
          leftAction={<BechoLogoMark size={34} />}
        />
        <ScrollView
          contentContainerStyle={[
            styles.authContainer,
            { paddingBottom: 36 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <BechoLogoMark size={64} />
          </View>
          <Text style={[styles.brandTitle, { color: c.text }]}>
            {isSignUp ? 'Create your Becho account' : 'Sign in to Becho'}
          </Text>
          <Text style={[styles.brandSub, { color: c.textMuted }]}>
            Buy, sell, and rent locally with instant chat.
          </Text>

          {isSignUp && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: c.textMuted }]}>Full Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.surfaceElevated,
                    borderColor: c.border,
                    color: c.text,
                  },
                ]}
                placeholder="e.g. Imrudeen"
                placeholderTextColor={c.textMuted}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textMuted }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textMuted }]}>Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              placeholder="Minimum 6 characters"
              placeholderTextColor={c.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <HapticButton
            hapticStyle="medium"
            style={[
              styles.primaryBtn,
              { backgroundColor: c.primary },
              authSubmitting && { opacity: 0.7 },
            ]}
            onPress={handleAuth}
            disabled={authSubmitting}
          >
            {authSubmitting ? (
              <ActivityIndicator color={c.primaryText} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.primaryText }]}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </HapticButton>

          <HapticButton
            hapticStyle="selection"
            style={styles.switchBtn}
            onPress={() => setIsSignUp((prev) => !prev)}
          >
            <Text style={[styles.switchText, { color: c.primary }]}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : 'New to Becho? Create an account'}
            </Text>
          </HapticButton>

          <View style={{ marginTop: 24 }}>{renderThemeCard()}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // LOGGED-IN VIEW
  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Profile & Settings"
        subtitle={profile?.city ? `${profile.city} • Becho Member` : 'Becho Member'}
        leftAction={<BechoLogoMark size={34} />}
      />

      <ScrollView
        contentContainerStyle={[
          styles.profileContainer,
          { paddingBottom: 36 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* USER SUMMARY CARD */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
          ]}
        >
          <View style={styles.avatarRow}>
            <View style={[styles.avatarCircle, { backgroundColor: c.primaryMuted }]}>
              <Text style={[styles.avatarInitial, { color: c.primary }]}>
                {(profile?.full_name || user.email || 'B')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: c.text }]}>
                {profile?.full_name || 'Becho Member'}
              </Text>
              <Text style={[styles.userEmail, { color: c.textMuted }]}>{user.email}</Text>
            </View>
          </View>
        </View>

        {/* APPEARANCE & MULTI-THEME CARD */}
        {renderThemeCard()}

        {/* MY LISTINGS MANAGEMENT */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              My Ads ({myListings.length})
            </Text>
            <HapticButton
              hapticStyle="selection"
              onPress={() => router.push('/(tabs)/post')}
            >
              <Text style={[styles.newAdLink, { color: c.primary }]}>+ Post New</Text>
            </HapticButton>
          </View>

          {loadingAds ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
          ) : myListings.length === 0 ? (
            <Text style={[styles.emptyAdsText, { color: c.textMuted }]}>
              You haven&apos;t posted any ads yet. Tap &ldquo;+ Post New&rdquo; to list your
              first item.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {myListings.map((item) => {
                const isActive = item.status === 'ACTIVE';
                const isBusy = busyAdId === item.id;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.adItem,
                      { backgroundColor: c.surfaceElevated, borderColor: c.border },
                    ]}
                  >
                    <HapticButton
                      style={styles.adTopRow}
                      onPress={() => router.push(`/listing/${item.id}`)}
                    >
                      {item.images?.[0] ? (
                        <Image source={{ uri: item.images[0] }} style={styles.adThumb} />
                      ) : (
                        <View
                          style={[
                            styles.adThumbPlaceholder,
                            { backgroundColor: c.surface },
                          ]}
                        >
                          <Ionicons name="image-outline" size={20} color={c.textMuted} />
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <View style={styles.rowBetween}>
                          <Text style={[styles.adPrice, { color: c.primary }]}>
                            {formatListingPrice(item)}
                          </Text>
                          <View
                            style={[
                              styles.statusPill,
                              isActive
                                ? { backgroundColor: c.primaryMuted }
                                : { backgroundColor: 'rgba(239, 68, 68, 0.16)' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                { color: isActive ? c.primary : c.danger },
                              ]}
                            >
                              {item.status}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[styles.adTitle, { color: c.text }]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.adMeta, { color: c.textMuted }]}>
                          {item.listing_type} • {item.category}
                        </Text>
                      </View>
                    </HapticButton>

                    <View style={styles.adActions}>
                      <HapticButton
                        style={[
                          styles.actionBtn,
                          { backgroundColor: c.surface, borderColor: c.border },
                        ]}
                        onPress={() => handleToggleAdStatus(item)}
                        disabled={isBusy}
                      >
                        <Ionicons
                          name={isActive ? 'checkmark-done-outline' : 'refresh-outline'}
                          size={15}
                          color={c.primary}
                        />
                        <Text style={[styles.actionBtnText, { color: c.primary }]}>
                          {isActive
                            ? item.listing_type === 'RENT'
                              ? 'Mark Rented'
                              : 'Mark Sold'
                            : 'Relist Active'}
                        </Text>
                      </HapticButton>

                      <HapticButton
                        style={[
                          styles.actionBtn,
                          styles.deleteBtn,
                          { backgroundColor: c.surface },
                        ]}
                        onPress={() => handleDeleteAd(item)}
                        disabled={isBusy}
                      >
                        <Ionicons name="trash-outline" size={15} color={c.danger} />
                        <Text style={[styles.actionBtnText, { color: c.danger }]}>
                          Delete
                        </Text>
                      </HapticButton>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* SELLER DETAILS FORM */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: c.text }]}>
            Seller & Contact Details
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textMuted }]}>Display Name</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor={c.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textMuted }]}>
              Phone Number (optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={c.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: c.textMuted }]}>Default City</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  color: c.text,
                },
              ]}
              value={editCity}
              onChangeText={setEditCity}
              placeholder="Chennai"
              placeholderTextColor={c.textMuted}
            />
          </View>

          <HapticButton
            hapticStyle="medium"
            style={[
              styles.primaryBtn,
              { backgroundColor: c.primary },
              savingProfile && { opacity: 0.7 },
            ]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator color={c.primaryText} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.primaryText }]}>
                Save Profile
              </Text>
            )}
          </HapticButton>
        </View>

        <HapticButton
          hapticStyle="medium"
          style={[
            styles.signOutBtn,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text style={[styles.signOutText, { color: c.danger }]}>Sign Out</Text>
        </HapticButton>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1 },
  authContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  profileContainer: { padding: 16, gap: 16 },
  brandTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  brandSub: { fontSize: 14, marginTop: 6, marginBottom: 24, textAlign: 'center' },
  card: {
    borderWidth: 1,
    padding: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '800' },
  userName: { fontSize: 18, fontWeight: '700' },
  userEmail: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  newAdLink: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  emptyAdsText: { fontSize: 13, lineHeight: 19 },
  adItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  adTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adThumb: { width: 58, height: 58, borderRadius: 10 },
  adThumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adPrice: { fontSize: 14, fontWeight: '800' },
  adTitle: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  adMeta: { fontSize: 11, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  adActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtn: { borderColor: 'rgba(239, 68, 68, 0.35)' },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  switchBtn: { marginTop: 18, alignItems: 'center' },
  switchText: { fontSize: 14, fontWeight: '600' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  signOutText: { fontSize: 15, fontWeight: '700' },
});