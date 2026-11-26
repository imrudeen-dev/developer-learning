import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Platform, View, useWindowDimensions } from 'react-native';
import '../global.css';
import { AppFooter, AppHeader } from '../components/app-header';
import { AppText as Text } from '../components/app-text';
import { DesktopSidebar } from '../components/desktop-sidebar';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { AppPreferencesProvider, useAppPreferences } from '../lib/app-preferences';
import { AppTourProvider } from '../lib/tour-context';
import { PlatformSettingsProvider, usePlatformSettings } from '../lib/platform-settings';
import { NotificationCenterProvider } from '../lib/notification-center';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.warn('[Becho] Could not keep the native splash screen visible:', error);
});

function PushNotificationObserver() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data ?? {};
      const listingId = typeof data.listing_id === 'string' ? data.listing_id : null;
      const actorId = typeof data.actor_id === 'string' ? data.actor_id : null;
      const notificationType =
        typeof data.notification_type === 'string' ? data.notification_type : '';

      if (notificationType === 'message_received' && listingId) {
        router.push({
          pathname: '/chat/[listingId]',
          params: { listingId, ...(actorId ? { peerId: actorId } : {}) },
        });
      } else if (
        notificationType.startsWith('offer_') ||
        notificationType.startsWith('deal_')
      ) {
        router.push('/(tabs)/orders');
      } else if (listingId) {
        router.push(`/listing/${listingId}`);
      } else {
        router.push('/notifications');
      }

      void Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => {
        console.error('[Becho] Could not clear the handled push response:', error);
      });
    },
    [router]
  );

  useEffect(() => {
    if (!lastResponse) return;
    const responseId = lastResponse.notification.request.identifier;
    if (handledResponseId.current === responseId) return;
    handledResponseId.current = responseId;
    handleResponse(lastResponse);
  }, [lastResponse, handleResponse]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) return;
      handledResponseId.current = responseId;
      handleResponse(response);
    });
    return () => subscription.remove();
  }, [handleResponse]);

  return null;
}

function RootNavigator() {
  const { loading, user } = useAuth();
  const { theme, loading: preferencesLoading } = useAppPreferences();
  const { settings, loading: settingsLoading } = usePlatformSettings();
  const { width } = useWindowDimensions();
  const showDesktopSidebar = Platform.OS === 'web' && width >= 1024;

  useEffect(() => {
    if (!loading && !settingsLoading && !preferencesLoading) {
      void SplashScreen.hideAsync().catch((error: unknown) => {
        console.warn('[Becho] Could not hide the native splash screen:', error);
      });
    }
  }, [loading, settingsLoading, preferencesLoading]);

  if (loading || settingsLoading || preferencesLoading) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: theme.background }}
      >
        <LinearGradient
          colors={theme.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <Image
          source={require('../../assets/images/splash-icon.png')}
          resizeMode="contain"
          style={{ width: 260, height: 260 }}
          accessibilityLabel="Becho"
        />
        <Text className="mt-1 text-center text-sm text-gray-400">
          Your neighborhood marketplace
        </Text>
        <ActivityIndicator className="mt-6" color={theme.primary} />
      </View>
    );
  }

  if (settings.maintenance_mode && user?.app_metadata?.role !== 'platform_owner') {
    return (
      <>
        {Platform.OS !== 'web' && <PushNotificationObserver />}
        <StatusBar style={theme.isLight ? 'dark' : 'light'} />
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ backgroundColor: theme.background }}
        >
          <LinearGradient
            colors={theme.backgroundGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <Text className="text-xl font-extrabold text-white">We’ll be right back</Text>
          <Text className="mt-2 text-center text-sm leading-5 text-gray-400">
            Becho is temporarily unavailable while we make improvements.
          </Text>
        </View>
      </>
    );
  }

  return (
    <AppTourProvider>
      <>
      {Platform.OS !== 'web' && <PushNotificationObserver />}
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
        <LinearGradient
          colors={theme.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        {showDesktopSidebar && <DesktopSidebar />}
        <View style={{ flex: 1 }}>
          <AppHeader />
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="listing/[id]" />
              <Stack.Screen name="chat/[listingId]" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
            </Stack>
          </View>
          <AppFooter />
        </View>
      </View>
      </>
    </AppTourProvider>
  );
}

export default function RootLayout() {
  return (
    <AppPreferencesProvider>
      <AuthProvider>
        <NotificationCenterProvider>
          <PlatformSettingsProvider>
            <RootNavigator />
          </PlatformSettingsProvider>
        </NotificationCenterProvider>
      </AuthProvider>
    </AppPreferencesProvider>
  );
}
