import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { NotificationBell } from '../../components/notification-bell';
import { APP_THEMES, useAppPreferences, type AppThemeId, type TranslationKey } from '../../lib/app-preferences';
import { isPlatformOwner, useAuth } from '../../lib/auth-context';
import { getListingMetrics } from '../../lib/marketplace';
import { useNotificationCenter } from '../../lib/notification-center';
import type { PushRegistrationResult } from '../../lib/push-notifications';
import { registerPushToken, unregisterPushToken } from '../../lib/push-notifications';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';
import { TourTarget, useAppTour } from '../../lib/tour-context';

interface SellerSettings {
  public_profile: boolean;
  accept_offers: boolean;
  show_phone: boolean;
}

interface SellerStats {
  activeListings: number;
  totalViews: number;
  pendingOffers: number;
  completedDeals: number;
}

const DEFAULT_SELLER_SETTINGS: SellerSettings = {
  public_profile: true,
  accept_offers: true,
  show_phone: false,
};

function PreferencesPanel() {
  const { theme, themeId, setThemeId, language, setLanguage, t } = useAppPreferences();
  const themeOptions: { id: AppThemeId; label: TranslationKey }[] = [
    { id: 'emerald', label: 'themeEmerald' },
    { id: 'ocean', label: 'themeOcean' },
    { id: 'violet', label: 'themeViolet' },
    { id: 'light', label: 'themeLight' },
  ];

  return (
    <View
      className="mb-5 rounded-2xl border p-4"
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
    >
      <Text className="font-bold text-white">{t('personalization')}</Text>
      <Text className="mb-2 mt-4 text-xs font-semibold text-gray-400">{t('colorTheme')}</Text>
      <View className="flex-row flex-wrap">
        {themeOptions.map(({ id, label }) => {
          const option = APP_THEMES[id];
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setThemeId(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: themeId === id }}
              accessibilityLabel={t(label)}
              className="mr-2 mb-2 flex-row items-center rounded-full border px-3 py-2"
              style={{
                backgroundColor: themeId === id ? `${theme.primary}1A` : 'transparent',
                borderColor: themeId === id ? theme.primary : theme.border,
              }}
            >
              <View className="mr-2 h-3 w-3 rounded-full" style={{ backgroundColor: option.primary }} />
              <Text className="text-xs font-semibold text-white">{t(label)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="mb-2 mt-3 text-xs font-semibold text-gray-400">{t('language')}</Text>
      <View className="flex-row">
        {(['en', 'ta'] as const).map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setLanguage(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: language === option }}
            className="mr-2 rounded-full border px-4 py-2"
            style={{
              backgroundColor: language === option ? theme.primary : theme.background,
              borderColor: language === option ? theme.primary : theme.border,
            }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: language === option ? (theme.isLight ? '#fff' : '#052e16') : theme.text }}
            >
              {option === 'en' ? t('english') : t('tamil')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { theme, t } = useAppPreferences();
  const { unreadCount } = useNotificationCenter();
  const { startTour } = useAppTour();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [sellerSettings, setSellerSettings] = useState(DEFAULT_SELLER_SETTINGS);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [verificationStatus, setVerificationStatus] = useState('not requested');
  const [screenLoading, setScreenLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [pushStatus, setPushStatus] = useState<PushRegistrationResult | 'idle'>('idle');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const userId = user?.id;

  const loadAccountData = useCallback(async () => {
    if (!user) {
      setScreenLoading(false);
      setStats(null);
      return;
    }

    setScreenLoading(true);
    setSettingsError('');
    try {
      const [sellerSettingsResult, listingsResult, offersResult, dealsResult, verificationResult] =
        await Promise.all([
          supabase
            .from('seller_settings')
            .select('public_profile, accept_offers, show_phone')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase.from('listings').select('id, status').eq('seller_id', user.id),
          supabase
            .from('offers')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', user.id)
            .eq('status', 'pending'),
          supabase
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', user.id)
            .eq('status', 'completed'),
          supabase
            .from('verified_sellers')
            .select('status')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

      for (const result of [sellerSettingsResult, listingsResult, offersResult, dealsResult, verificationResult]) {
        if (result.error) throw result.error;
      }

      setSellerSettings(sellerSettingsResult.data ?? DEFAULT_SELLER_SETTINGS);
      setVerificationStatus(verificationResult.data?.status ?? 'not requested');

      const listingRows = listingsResult.data ?? [];
      const metricMap = await getListingMetrics(listingRows.map((listing) => listing.id));
      setStats({
        activeListings: listingRows.filter((listing) => listing.status === 'ACTIVE').length,
        totalViews: Array.from(metricMap.values()).reduce((sum, item) => sum + item.view_count, 0),
        pendingOffers: offersResult.count ?? 0,
        completedDeals: dealsResult.count ?? 0,
      });
    } catch (loadError) {
      console.error('[Becho] Could not load profile dashboard:', loadError);
      setSettingsError('Some account controls need the marketplace database migration.');
    } finally {
      setScreenLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadAccountData();
    }, [loadAccountData])
  );

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let active = true;
    void registerPushToken(userId, false)
      .then((result) => {
        if (!active) return;
        setPushStatus(result);
        // Quiet auto-sync: only surface a message when setup is incomplete.
        if (
          result === 'firebase_not_configured' ||
          result === 'setup_incomplete' ||
          result === 'expo_go_unsupported'
        ) {
          setPushMessage(
            result === 'expo_go_unsupported'
              ? 'Push alerts need a development or production build (not Expo Go on Android).'
              : result === 'firebase_not_configured'
                ? 'Push native setup is pending for this build. App stays usable without alerts.'
                : 'Push setup is incomplete for this Expo project.'
          );
        }
      })
      .catch((pushError: unknown) => {
        console.warn('[Becho] Could not sync device push token:', pushError);
        if (active) {
          setPushMessage('Device notifications need push setup for this Expo project.');
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least six characters.');
      return;
    }
    if (isSignUp && !fullName.trim()) {
      Alert.alert('Add your name', 'Enter the name buyers will see on your profile.');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Check your email', 'Confirm your email address to finish creating your account.');
        } else {
          Alert.alert('Welcome to Becho', 'Your account is ready.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (authError) {
      console.error('[Becho] Authentication failed:', authError);
      Alert.alert('Could not sign in', authError instanceof Error ? authError.message : 'Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const updateSellerSetting = async (key: keyof SellerSettings, value: boolean) => {
    if (!user) return;
    const previous = sellerSettings;
    setSellerSettings((current) => ({ ...current, [key]: value }));
    try {
      const { error } = await supabase.from('seller_settings').upsert({
        user_id: user.id,
        ...sellerSettings,
        [key]: value,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (saveError) {
      console.error('[Becho] Could not update seller preference:', saveError);
      setSellerSettings(previous);
      Alert.alert('Setting not saved', 'Try again after the marketplace database migration is applied.');
    }
  };

  const requestVerification = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.from('verified_sellers').upsert({
        user_id: user.id,
        status: 'pending',
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (requestError) {
      console.error('[Becho] Could not request seller verification:', requestError);
      Alert.alert('Could not request verification', 'Try again after the marketplace database migration is applied.');
      return;
    }
    setVerificationStatus('pending');
    Alert.alert('Request submitted', 'The platform team will review your seller profile.');
  };

  const signOut = async () => {
    if (user) {
      try {
        await unregisterPushToken(user.id);
      } catch (tokenError) {
        console.error('[Becho] Could not remove this device push token:', tokenError);
        Alert.alert(
          'Could not safely sign out',
          'This device could still receive alerts for your account. Check your connection and try again.'
        );
        return;
      }
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (signOutError) {
      console.error('[Becho] Sign out failed:', signOutError);
      Alert.alert('Could not sign out', 'Please try again.');
    }
  };

  const messageForPushResult = (result: typeof pushStatus) => {
    switch (result) {
      case 'registered':
        return 'Push alerts are enabled for this device.';
      case 'permission_required':
        return 'Allow notifications in your device settings to receive alerts.';
      case 'physical_device_required':
        return 'Remote push notifications require a physical iOS or Android device.';
      case 'expo_go_unsupported':
        return 'Push alerts do not work in Expo Go on Android. Use a development or production build to test them.';
      case 'unsupported_platform':
        return 'Install Becho on iOS or Android to enable device push alerts.';
      case 'firebase_not_configured':
        return 'Push is not ready on this build yet. Add Android FCM credentials (google-services.json) for production APKs. Dev continues without crash.';
      case 'setup_incomplete':
        return 'Push setup is incomplete for this Expo project. Link EAS project ID and rebuild.';
      default:
        return '';
    }
  };

  const enablePushNotifications = async () => {
    if (!user) return;
    setPushBusy(true);
    setPushMessage('');
    try {
      const result = await registerPushToken(user.id, true);
      setPushStatus(result);
      setPushMessage(messageForPushResult(result));
    } catch (pushError) {
      const msg =
        pushError instanceof Error
          ? pushError.message
          : 'Could not enable push alerts. Check the Expo and Supabase setup.';
      // Expected on Expo Go / missing FCM — warn only so LogBox does not show a red screen.
      console.warn('[Becho] Could not enable device notifications:', pushError);
      if (
        msg.toLowerCase().includes('expo go') ||
        msg.toLowerCase().includes('development build')
      ) {
        setPushStatus('expo_go_unsupported');
        setPushMessage(
          'Push alerts do not work in Expo Go on Android. Use a development or production build to test them.'
        );
      } else {
        setPushMessage(msg);
      }
    } finally {
      setPushBusy(false);
    }
  };

  if (loading || screenLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <KeyboardAvoidingView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="mb-5 h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${theme.primary}26` }}
          >
            <Ionicons name="storefront-outline" size={30} color={theme.primary} />
          </View>
          <Text className="text-2xl font-extrabold text-white">
            {isSignUp ? t('joinMarketplace') : t('welcomeBack')}
          </Text>
          <Text className="mb-6 mt-2 text-sm leading-5 text-gray-400">
            {isSignUp ? t('signUpHint') : t('signInHint')}
          </Text>
          {isSignUp && (
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('yourName')}
              placeholderTextColor={BECHO_COLORS.textMuted}
              className="mb-3 rounded-xl border px-4 py-3.5 text-white"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              autoComplete="name"
            />
          )}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('emailAddress')}
            placeholderTextColor={BECHO_COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            className="mb-3 rounded-xl border px-4 py-3.5 text-white"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('password')}
            placeholderTextColor={BECHO_COLORS.textMuted}
            secureTextEntry
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            className="mb-4 rounded-xl border px-4 py-3.5 text-white"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          />
          <TouchableOpacity
            onPress={() => void handleAuth()}
            disabled={authSubmitting}
            className="min-h-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: theme.primary }}
          >
            {authSubmitting ? (
              <ActivityIndicator color="#052e16" />
            ) : (
              <Text className="font-bold text-[#052e16]">{isSignUp ? t('createAccount') : t('signIn')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsSignUp((current) => !current)} className="mt-5 items-center py-2">
            <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
              {isSignUp ? t('alreadyMember') : t('newToBecho')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={startTour} className="mt-2 items-center py-2">
            <Text className="text-xs text-gray-500">{t('seeHowItWorks')}</Text>
          </TouchableOpacity>
          <View className="mt-8">
            <PreferencesPanel />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const initials = (profile?.full_name || user.email || 'B')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <View className="mb-5 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-extrabold text-white">{t('yourAccount')}</Text>
          <Text className="mt-1 text-sm text-gray-400">{t('managePresence')}</Text>
        </View>
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t('settings')}
            className="mr-2 h-10 w-10 items-center justify-center rounded-xl border"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            <Ionicons name="settings-outline" size={18} color={theme.primary} />
          </TouchableOpacity>
          <NotificationBell onPress={() => router.push('/notifications')} iconSize={19} />
          <TouchableOpacity
            onPress={() => void signOut()}
            accessibilityRole="button"
            accessibilityLabel={t('signOut')}
            className="ml-2 h-10 w-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10"
          >
            <Ionicons name="log-out-outline" size={18} color="#f87171" />
          </TouchableOpacity>
        </View>
      </View>

      <View
        className="mb-5 flex-row items-center rounded-2xl border p-4"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <View
          className="mr-3 h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${theme.primary}26` }}
        >
          <Text className="text-lg font-extrabold" style={{ color: theme.primary }}>{initials}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="font-bold text-white">{profile?.full_name || t('bechoMember')}</Text>
            {verificationStatus === 'verified' && (
              <Ionicons name="checkmark-circle" size={16} color={theme.primary} style={{ marginLeft: 5 }} />
            )}
          </View>
          <Text className="mt-1 text-xs text-gray-400">{user.email}</Text>
          <Text className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: theme.primary }}>
            {isPlatformOwner(user) ? t('platformOwner') : verificationStatus === 'verified' ? t('verifiedSeller') : t('buyerSeller')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/orders')}
          accessibilityRole="button"
          accessibilityLabel={t('openMarketplaceActivity')}
        >
          <Ionicons name="chevron-forward" size={18} color={BECHO_COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <TourTarget id="profile-settings" style={{ width: '100%' }}>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings')}
          className="mb-5 flex-row items-center rounded-2xl border p-4"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <View
            className="mr-3 h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${theme.primary}24` }}
          >
            <Ionicons name="settings-outline" size={20} color={theme.primary} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-white">{t('settings')}</Text>
            <Text className="mt-1 text-xs text-gray-400">{t('settingsSubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.primary} />
        </TouchableOpacity>
      </TourTarget>

      {!!settingsError && (
        <View className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
          <Text className="text-xs text-amber-200">{settingsError}</Text>
        </View>
      )}

      <View className="mb-5 flex-row">
        {[
          { label: t('activeAds'), value: stats?.activeListings ?? '—' },
          { label: t('listingViews'), value: stats?.totalViews ?? '—' },
          { label: t('openOffers'), value: stats?.pendingOffers ?? '—' },
        ].map((item) => (
          <View
            key={item.label}
            className="mr-2 flex-1 rounded-xl border p-3"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            <Text className="text-[10px] text-gray-400">{item.label}</Text>
            <Text className="mt-1 text-lg font-extrabold text-white">{item.value}</Text>
          </View>
        ))}
      </View>

      <PreferencesPanel />

      <View
        className="mb-5 rounded-2xl border p-4"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="font-bold text-white">{t('sellerProfile')}</Text>
            <Text className="mt-1 text-xs text-gray-400">{t('sellerProfileHint')}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>{t('myActivity')}</Text>
          </TouchableOpacity>
        </View>
        {([
          ['public_profile', t('publicSellerProfile')],
          ['accept_offers', t('acceptBuyerOffers')],
          ['show_phone', t('showPhoneOnListings')],
        ] as const).map(([key, label], index) => (
          <View
            key={key}
            className={`flex-row items-center justify-between py-3 ${
              index < 2 ? 'border-b border-white/10' : ''
            }`}
          >
            <Text className="flex-1 pr-3 text-sm text-gray-200">{label}</Text>
            <Switch
              value={sellerSettings[key]}
              onValueChange={(value) => void updateSellerSetting(key, value)}
              trackColor={{ true: theme.primary, false: '#374151' }}
              thumbColor="#f9fafb"
              accessibilityLabel={label}
            />
          </View>
        ))}
      </View>

      <View
        className="mb-5 rounded-2xl border p-4"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <Text className="font-bold text-white">{t('sellerVerification')}</Text>
        <Text className="mt-1 text-xs leading-5 text-gray-400">
          {verificationStatus === 'verified'
            ? t('verifiedAccountMessage')
            : verificationStatus === 'pending'
              ? t('verificationPendingMessage')
              : t('verificationBenefit')}
        </Text>
        {verificationStatus !== 'verified' && verificationStatus !== 'pending' && (
          <TouchableOpacity
            onPress={() => void requestVerification()}
            className="mt-3 self-start rounded-lg px-3 py-2"
            style={{ backgroundColor: `${theme.primary}1A` }}
          >
            <Text className="text-xs font-bold" style={{ color: theme.primary }}>{t('requestVerification')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View
        className="mb-5 rounded-2xl border"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <TouchableOpacity
          onPress={() => router.push('/notifications')}
          className="flex-row items-center border-b border-white/10 px-4 py-4"
        >
          <Ionicons name="notifications-outline" size={19} color="#d1d5db" />
          <Text className="ml-3 flex-1 text-sm text-white">{t('notifications')}</Text>
          {unreadCount > 0 && (
            <View className="mr-2 min-w-[20px] items-center rounded-full bg-rose-500 px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={17} color="#6b7280" />
        </TouchableOpacity>
        <View className="border-b border-white/10 px-4 py-4">
          <View className="flex-row items-center">
            <Ionicons name="phone-portrait-outline" size={19} color="#d1d5db" />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-semibold text-white">{t('devicePush')}</Text>
              <Text className="mt-1 text-xs leading-5 text-gray-400">
                {Platform.OS === 'web'
                  ? t('webPushHint')
                  : pushStatus === 'registered'
                    ? t('pushEnabled')
                    : t('pushHint')}
              </Text>
            </View>
          </View>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={() => void enablePushNotifications()}
              disabled={pushBusy}
              className="mt-3 self-start rounded-lg px-3 py-2"
              style={{ backgroundColor: `${theme.primary}1A` }}
              accessibilityRole="button"
              accessibilityLabel={t('enablePush')}
            >
              <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                {pushBusy ? t('starting') : pushStatus === 'registered' ? t('refreshPush') : t('enablePush')}
              </Text>
            </TouchableOpacity>
          )}
          {!!pushMessage && <Text className="mt-2 text-xs text-amber-200">{pushMessage}</Text>}
        </View>
        <TouchableOpacity onPress={startTour} className="flex-row items-center px-4 py-4">
          <Ionicons name="help-circle-outline" size={20} color="#d1d5db" />
          <Text className="ml-3 flex-1 text-sm text-white">{t('replayTour')}</Text>
          <Ionicons name="chevron-forward" size={17} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {isPlatformOwner(user) && (
        <TouchableOpacity
          onPress={() => router.push('/admin')}
          className="mb-5 flex-row items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
        >
          <Ionicons name="shield-checkmark" size={22} color={theme.primary} />
          <View className="ml-3 flex-1">
            <Text className="font-bold text-white">{t('platformControls')}</Text>
            <Text className="mt-1 text-xs text-gray-400">{t('manageFeatures')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#9ca3af" />
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}