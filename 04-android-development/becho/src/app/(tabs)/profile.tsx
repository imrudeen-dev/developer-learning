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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BechoLogoMark,
  HapticButton,
  NativeBottomSheet,
  NativeInput,
} from '../../components/NativeUI';
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

  // Theme bottom sheet state
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

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

  const renderThemeBottomSheet = () => (
    <NativeBottomSheet
      visible={themeSheetOpen}
      onClose={() => setThemeSheetOpen(false)}
      title="Choose Android Theme"
    >
      <View style={{ gap: 10, paddingBottom: 6 }}>
        {(Object.keys(BECHO_THEMES) as ThemeId[]).map((id) => {
          const item = BECHO_THEMES[id];
          const active = themeId === id;
          return (
            <HapticButton
              key={id}
              hapticStyle="selection"
              scaleTo={0.98}
              onPress={() => {
                setThemeId(id);
                setThemeSheetOpen(false);
              }}
              style={[
                styles.themeOptionRow,
                {
                  backgroundColor: active ? c.primaryMuted : c.surfaceElevated,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <View style={styles.themeOptionLeft}>
                <View
                  style={[
                    styles.themeSwatch,
                    {
                      backgroundColor: item.colors.primary,
                      borderColor: item.colors.bg,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.themeOptionTitle, { color: c.text }]}>
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.themeOptionSub, { color: c.textMuted }]}
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
    </NativeBottomSheet>
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
        <ScrollView
          contentContainerStyle={[
            styles.authContainer,
            { paddingBottom: 96 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.authHero}>
            <BechoLogoMark size={64} />
            <Text style={[styles.brandTitle, { color: c.text }]}>
              {isSignUp ? 'Create your account' : 'Welcome to Becho'}
            </Text>
            <Text style={[styles.brandSub, { color: c.textMuted }]}>
              Buy, sell, and rent locally with instant chat.
            </Text>
          </View>

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
            {isSignUp && (
              <NativeInput
                label="Full Name"
                icon="person-outline"
                placeholder="e.g. Imrudeen"
                value={fullName}
                onChangeText={setFullName}
                containerStyle={styles.fieldSpacing}
              />
            )}

            <NativeInput
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              containerStyle={styles.fieldSpacing}
            />

            <NativeInput
              label="Password"
              icon="lock-closed-outline"
              placeholder="Minimum 6 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              containerStyle={styles.fieldSpacing}
            />

            <HapticButton
              hapticStyle="medium"
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: c.primary,
                  borderRadius: theme.radius.md,
                  ...getCardElevation(theme),
                },
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
          </View>

          {/* THEME SHEET TRIGGER */}
          <HapticButton
            hapticStyle="light"
            style={[
              styles.quickRowCard,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.lg,
                ...getCardElevation(theme),
              },
            ]}
            onPress={() => setThemeSheetOpen(true)}
          >
            <View style={[styles.quickIconBox, { backgroundColor: c.primaryMuted }]}>
              <Ionicons name="color-palette-outline" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.quickTitle, { color: c.text }]}>App Theme</Text>
              <Text style={[styles.quickSub, { color: c.textMuted }]}>{theme.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
          </HapticButton>

          {renderThemeBottomSheet()}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // LOGGED-IN VIEW
  const initial = (profile?.full_name || user.email || 'B')[0].toUpperCase();

  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.profileContainer,
          { paddingBottom: 96 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* TOP BRAND STRIP */}
        <View style={styles.topStrip}>
          <View style={styles.brandRow}>
            <BechoLogoMark size={36} />
            <Text style={[styles.screenTitle, { color: c.text }]}>Profile</Text>
          </View>

          <HapticButton
            hapticStyle="selection"
            style={[
              styles.themePill,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.full,
                ...getCardElevation(theme),
              },
            ]}
            onPress={() => setThemeSheetOpen(true)}
          >
            <Ionicons name="color-palette" size={14} color={c.primary} />
            <Text style={[styles.themePillText, { color: c.text }]}>{theme.name}</Text>
          </HapticButton>
        </View>

        {/* USER HERO CARD */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <View style={styles.avatarRow}>
            <View
              style={[
                styles.avatarRing,
                { borderColor: c.primary, backgroundColor: c.primaryMuted },
              ]}
            >
              <Text style={[styles.avatarInitial, { color: c.primary }]}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: c.text }]} numberOfLines={1}>
                {profile?.full_name || 'Becho Member'}
              </Text>
              <Text style={[styles.userEmail, { color: c.textMuted }]} numberOfLines={1}>
                {user.email}
              </Text>
              <View style={styles.cityTagRow}>
                <Ionicons name="location" size={12} color={c.primary} />
                <Text style={[styles.cityTagText, { color: c.textSecondary }]}>
                  {profile?.city || 'Chennai'}
                </Text>
              </View>
            </View>
          </View>

          {/* QUICK ACTION TILES */}
          <View style={styles.quickGrid}>
            <HapticButton
              hapticStyle="light"
              style={[
                styles.quickTile,
                { backgroundColor: c.surfaceElevated, borderRadius: theme.radius.md },
              ]}
              onPress={() => router.push('/(tabs)/post')}
            >
              <Ionicons name="add-circle" size={20} color={c.primary} />
              <Text style={[styles.quickTileLabel, { color: c.text }]}>Post Ad</Text>
            </HapticButton>

            <HapticButton
              hapticStyle="light"
              style={[
                styles.quickTile,
                { backgroundColor: c.surfaceElevated, borderRadius: theme.radius.md },
              ]}
              onPress={() => router.push('/(tabs)/chats')}
            >
              <Ionicons name="chatbubbles" size={20} color={c.rentBadge} />
              <Text style={[styles.quickTileLabel, { color: c.text }]}>Inbox</Text>
            </HapticButton>

            <HapticButton
              hapticStyle="light"
              style={[
                styles.quickTile,
                { backgroundColor: c.surfaceElevated, borderRadius: theme.radius.md },
              ]}
              onPress={() => setThemeSheetOpen(true)}
            >
              <Ionicons name="color-palette" size={20} color={c.sellBadge} />
              <Text style={[styles.quickTileLabel, { color: c.text }]}>Themes</Text>
            </HapticButton>
          </View>
        </View>

        {/* MY LISTINGS MANAGEMENT */}
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
            <ActivityIndicator color={c.primary} style={{ marginVertical: 18 }} />
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
                      {
                        backgroundColor: c.surfaceElevated,
                        borderRadius: theme.radius.lg,
                      },
                    ]}
                  >
                    <HapticButton
                      style={styles.adTopRow}
                      onPress={() => router.push(`/listing/${item.id}`)}
                    >
                      {item.images?.[0] ? (
                        <Image
                          source={{ uri: item.images[0] }}
                          style={[styles.adThumb, { borderRadius: theme.radius.md }]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.adThumbPlaceholder,
                            { backgroundColor: c.surface, borderRadius: theme.radius.md },
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
                              {
                                backgroundColor: isActive
                                  ? c.primaryMuted
                                  : 'rgba(239, 68, 68, 0.16)',
                                borderRadius: theme.radius.sm,
                              },
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
                          { backgroundColor: c.surface, borderRadius: theme.radius.sm },
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
                          { backgroundColor: c.surface, borderRadius: theme.radius.sm },
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
            styles.surfaceBlock,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.xl,
              ...getCardElevation(theme),
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: c.text }]}>
            Seller & Contact Details
          </Text>

          <NativeInput
            label="Display Name"
            icon="person-outline"
            value={editName}
            onChangeText={setEditName}
            placeholder="Your name"
            containerStyle={styles.fieldSpacing}
          />

          <NativeInput
            label="Phone Number (optional)"
            icon="call-outline"
            value={editPhone}
            onChangeText={setEditPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            containerStyle={styles.fieldSpacing}
          />

          <NativeInput
            label="Default City"
            icon="location-outline"
            value={editCity}
            onChangeText={setEditCity}
            placeholder="Chennai"
            containerStyle={styles.fieldSpacing}
          />

          <HapticButton
            hapticStyle="medium"
            style={[
              styles.primaryBtn,
              {
                backgroundColor: c.primary,
                borderRadius: theme.radius.md,
                ...getCardElevation(theme),
              },
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

        {/* SIGN OUT */}
        <HapticButton
          hapticStyle="medium"
          style={[
            styles.signOutBtn,
            {
              backgroundColor: c.surface,
              borderRadius: theme.radius.lg,
              ...getCardElevation(theme),
            },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text style={[styles.signOutText, { color: c.danger }]}>Sign Out</Text>
        </HapticButton>
      </ScrollView>

      {renderThemeBottomSheet()}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1 },
  authContainer: { flexGrow: 1, justifyContent: 'center', padding: 16, gap: 16 },
  authHero: { alignItems: 'center', paddingVertical: 12 },
  profileContainer: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  themePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  themePillText: { fontSize: 12, fontWeight: '700' },
  brandTitle: { fontSize: 24, fontWeight: '900', marginTop: 12, letterSpacing: -0.4 },
  brandSub: { fontSize: 14, marginTop: 4, textAlign: 'center' },
  heroCard: {
    padding: 18,
    gap: 16,
  },
  surfaceBlock: {
    padding: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 24, fontWeight: '900' },
  userName: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  userEmail: { fontSize: 13, marginTop: 2 },
  cityTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  cityTagText: { fontSize: 12, fontWeight: '600' },
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 5,
  },
  quickTileLabel: { fontSize: 12, fontWeight: '700' },
  quickRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  quickIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: { fontSize: 14, fontWeight: '700' },
  quickSub: { fontSize: 12, marginTop: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  newAdLink: { fontSize: 13, fontWeight: '800' },
  emptyAdsText: { fontSize: 13, lineHeight: 19 },
  adItem: {
    padding: 12,
    gap: 10,
  },
  adTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adThumb: { width: 58, height: 58 },
  adThumbPlaceholder: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adPrice: { fontSize: 14, fontWeight: '900' },
  adTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  adMeta: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  adActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  fieldSpacing: { marginBottom: 14 },
  primaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  switchBtn: { marginTop: 16, alignItems: 'center' },
  switchText: { fontSize: 13, fontWeight: '700' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  signOutText: { fontSize: 15, fontWeight: '800' },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  themeSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  themeOptionTitle: { fontSize: 14, fontWeight: '700' },
  themeOptionSub: { fontSize: 11, marginTop: 1 },
});