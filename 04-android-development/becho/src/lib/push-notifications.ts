import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PUSH_TOKEN_STORAGE_KEY = 'becho_push_token_v1';

// Expo Go (Android) no longer supports remote push / notification channels.
// Push only works in a development build or a production build with FCM configured.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  // appOwnership is set to "expo" inside Expo Go across SDK versions.
  (Constants as { appOwnership?: string | null }).appOwnership === 'expo';

if (!(isExpoGo && Platform.OS === 'android')) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (handlerError) {
    console.warn('[Becho] Could not set notification handler:', handlerError);
  }
}

export type PushRegistrationResult =
  | 'registered'
  | 'permission_required'
  | 'physical_device_required'
  | 'expo_go_unsupported'
  | 'unsupported_platform'
  | 'firebase_not_configured'
  | 'setup_incomplete';

function isFirebaseOrChannelFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : String(error ?? '');

  const lower = message.toLowerCase();
  return (
    lower.includes('firebase') ||
    lower.includes('googleservicesfile') ||
    lower.includes('default firebaseapp is not initialized') ||
    lower.includes('setnotificationchannelasync') ||
    lower.includes('nullpointerexception') ||
    lower.includes('attempt to invoke virtual method') ||
    lower.includes('fcm') ||
    lower.includes('notificationchannel') ||
    lower.includes('removed from expo go') ||
    lower.includes('use a development build') ||
    lower.includes('sdk 53') ||
    lower.includes('remote notifications') && lower.includes('expo go')
  );
}

/**
 * Best-effort Android channel setup. Never throws.
 * Expo Go and builds without native notification modules can NPE here.
 */
async function ensureAndroidDefaultChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (isExpoGo) return;

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Becho updates',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
    });
  } catch (channelError) {
    // Channel creation must never block token registration or crash the UI.
    // app.json already sets defaultChannel: "default" for production builds.
    console.warn('[Becho] Could not create Android notification channel:', channelError);
  }
}

export async function registerPushToken(
  userId: string,
  requestPermission: boolean
): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported_platform';
  if (!Device.isDevice) return 'physical_device_required';
  if (isExpoGo && Platform.OS === 'android') return 'expo_go_unsupported';

  await ensureAndroidDefaultChannel();

  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && requestPermission) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return 'permission_required';

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return 'setup_incomplete';
    }

    let expoPushToken: string;
    try {
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
      expoPushToken = tokenResult.data;
    } catch (tokenError) {
      const msg = tokenError instanceof Error ? tokenError.message.toLowerCase() : String(tokenError).toLowerCase();
      if (msg.includes('expo go') || msg.includes('development build') || msg.includes('sdk 53')) {
        console.warn('[Becho] Push unavailable in Expo Go:', tokenError);
        return 'expo_go_unsupported';
      }
      if (isFirebaseOrChannelFailure(tokenError)) {
        console.warn('[Becho] Push token unavailable (Firebase / native push not ready):', tokenError);
        return 'firebase_not_configured';
      }
      throw tokenError;
    }

    if (!expoPushToken) {
      return 'setup_incomplete';
    }

    const { error } = await supabase.from('device_push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' }
    );
    if (error) throw error;

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoPushToken);
    return 'registered';
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (msg.includes('expo go') || msg.includes('development build') || msg.includes('sdk 53')) {
      console.warn('[Becho] Push unavailable in this client:', error);
      return 'expo_go_unsupported';
    }
    if (isFirebaseOrChannelFailure(error)) {
      console.warn('[Becho] Push registration blocked by native push setup:', error);
      return 'firebase_not_configured';
    }
    // Never crash the app for push setup issues — surface as incomplete setup.
    console.warn('[Becho] Push registration failed (non-fatal):', error);
    return 'setup_incomplete';
  }
}

export async function unregisterPushToken(userId: string): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) return;

  const { error } = await supabase
    .from('device_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', token);
  if (error) throw error;

  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}
