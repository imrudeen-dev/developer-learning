import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PUSH_TOKEN_STORAGE_KEY = 'becho_push_token_v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult =
  | 'registered'
  | 'permission_required'
  | 'physical_device_required'
  | 'unsupported_platform';

export async function registerPushToken(
  userId: string,
  requestPermission: boolean
): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported_platform';
  if (!Device.isDevice) return 'physical_device_required';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Becho updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
    });
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
