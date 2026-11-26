import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PUSH_TOKEN_STORAGE_KEY = 'becho_push_token_v1';

// Expo Go (Android) no longer supports remote push / notification channels.
// Push only works in a development build or a production build.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!(isExpoGo && Platform.OS === 'android')) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export type PushRegistrationResult =
  | 'registered'
  | 'permission_required'
  | 'physical_device_required'
  | 'expo_go_unsupported'
  | 'unsupported_platform';

export async function registerPushToken(
  userId: string,
  requestPermission: boolean
): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported_platform';
  if (!Device.isDevice) return 'physical_device_required';
  if (isExpoGo && Platform.OS === 'android') return 'expo_go_unsupported';

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Becho updates',
        importance: AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22c55e',
      });
    } catch (channelError) {
      // Channel creation must not block token registration; the plugin's
      // `defaultChannel` in app.json already provides a fallback channel.
      console.warn('[Becho] Could not create Android notification channel:', channelError);
    }
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && requestPermission) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'permission_required';

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('Link this app to an Expo project before enabling push notifications.');
  }

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
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