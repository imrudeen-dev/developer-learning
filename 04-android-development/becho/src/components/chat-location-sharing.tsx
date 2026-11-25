import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from './app-text';
import { useAppPreferences } from '../lib/app-preferences';
import { supabase } from '../lib/supabase';

const HEARTBEAT_MS = 15_000;
const LOCATION_TTL_MS = 45_000;

interface LiveLocation {
  sender_id: string;
  latitude: number;
  longitude: number;
  expires_at: string;
}

function isLiveLocation(value: unknown): value is LiveLocation {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sender_id === 'string' &&
    typeof payload.latitude === 'number' &&
    payload.latitude >= -90 &&
    payload.latitude <= 90 &&
    typeof payload.longitude === 'number' &&
    payload.longitude >= -180 &&
    payload.longitude <= 180 &&
    typeof payload.expires_at === 'string' &&
    Date.parse(payload.expires_at) > Date.now()
  );
}

export function ChatLocationSharing({
  listingId,
  userId,
  peerId,
}: {
  listingId: string;
  userId: string;
  peerId: string;
}) {
  const [channelReady, setChannelReady] = useState(false);
  const [ownLocation, setOwnLocation] = useState<LiveLocation | null>(null);
  const [peerLocation, setPeerLocation] = useState<LiveLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { theme, t } = useAppPreferences();
  const translationRef = useRef(t);
  useEffect(() => {
    translationRef.current = t;
  }, [t]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoordinatesRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const ownLocationRef = useRef<LiveLocation | null>(null);
  const sharingAttemptRef = useRef(0);
  const mountedRef = useRef(false);

  const publishLocation = useCallback(
    async (coordinates: { latitude: number; longitude: number }) => {
      const location: LiveLocation = {
        sender_id: userId,
        ...coordinates,
        expires_at: new Date(Date.now() + LOCATION_TTL_MS).toISOString(),
      };
      ownLocationRef.current = location;
      setOwnLocation(location);

      const channel = channelRef.current;
      if (!channel) return;
      try {
        const result = await channel.send({
          type: 'broadcast',
          event: 'location',
          payload: location,
        });
        if (result !== 'ok') {
          console.error('[Becho] Could not publish live location:', result);
          setErrorMessage(t('locationReconnect'));
        } else {
          setErrorMessage('');
        }
      } catch (error) {
        console.error('[Becho] Could not publish live location:', error);
        setErrorMessage(t('locationReconnect'));
      }
    },
    [userId, t]
  );

  const stopSharing = useCallback(async () => {
    sharingAttemptRef.current += 1;
    watchRef.current?.remove();
    watchRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    lastCoordinatesRef.current = null;
    ownLocationRef.current = null;
    setOwnLocation(null);

    const channel = channelRef.current;
    if (channel) {
      try {
        const result = await channel.send({
          type: 'broadcast',
          event: 'location_stop',
          payload: { sender_id: userId },
        });
        if (result !== 'ok') {
          setErrorMessage(t('locationStopped'));
        }
      } catch (error) {
        console.error('[Becho] Could not notify the chat partner that sharing stopped:', error);
        setErrorMessage(t('locationStopped'));
      }
    }
  }, [userId, t]);

  useEffect(() => {
    const participants = [userId, peerId].sort();
    const topic = `becho-location:${listingId}:${participants[0]}:${participants[1]}`;
    let active = true;
    let failureReported = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    mountedRef.current = true;
    setChannelReady(false);
    setPeerLocation(null);

    const reportUnavailable = (reason: unknown) => {
      if (!active) return;
      setChannelReady(false);
      setErrorMessage(translationRef.current('locationSharingUnavailable'));
      if (failureReported) return;
      failureReported = true;
      const detail = reason instanceof Error ? reason.message : String(reason);
      console.warn('[Becho] Secure location sharing is unavailable; chat remains available.', detail);
    };

    const connect = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        reportUnavailable('No authenticated session is available for Realtime.');
        return;
      }

      await supabase.realtime.setAuth(accessToken);
      if (!active) return;

      channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'location' }, ({ payload }) => {
          if (!isLiveLocation(payload)) return;
          if (payload.sender_id === userId) return;
          if (payload.sender_id === peerId) setPeerLocation(payload);
        })
        .on('broadcast', { event: 'location_stop' }, ({ payload }) => {
          if (
            typeof payload === 'object' &&
            payload !== null &&
            'sender_id' in payload &&
            payload.sender_id === peerId
          ) {
            setPeerLocation(null);
          }
        });
      channelRef.current = channel;
      channel.subscribe((status, error) => {
        if (!active) return;
        setChannelReady(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          failureReported = false;
          setErrorMessage('');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reportUnavailable(error ?? status);
        }
      });
    };

    void connect().catch(reportUnavailable);

    return () => {
      active = false;
      mountedRef.current = false;
      sharingAttemptRef.current += 1;
      watchRef.current?.remove();
      watchRef.current = null;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      const currentChannel = channel;
      if (ownLocationRef.current && currentChannel) {
        void currentChannel
          .send({
            type: 'broadcast',
            event: 'location_stop',
            payload: { sender_id: userId },
          })
          .then((result) => {
            if (result !== 'ok') {
              console.error('[Becho] Could not notify the chat partner that sharing stopped:', result);
            }
          })
          .catch((error: unknown) => {
            console.error('[Becho] Could not notify the chat partner that sharing stopped:', error);
          });
      }
      if (channelRef.current === currentChannel) channelRef.current = null;
      if (currentChannel) void supabase.removeChannel(currentChannel);
    };
  }, [listingId, peerId, userId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (peerLocation && Date.parse(peerLocation.expires_at) <= now) setPeerLocation(null);
      if (ownLocationRef.current && Date.parse(ownLocationRef.current.expires_at) <= now) {
        void stopSharing();
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [peerLocation, stopSharing]);

  const startSharing = async () => {
    if (!channelReady || busy || ownLocationRef.current) return;
    const attempt = ++sharingAttemptRef.current;
    const isCurrentAttempt = () => sharingAttemptRef.current === attempt && channelRef.current !== null;
    setBusy(true);
    setErrorMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setErrorMessage(t('locationPermissionDenied'));
        return;
      }

      const firstLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isCurrentAttempt()) return;

      const coordinates = {
        latitude: firstLocation.coords.latitude,
        longitude: firstLocation.coords.longitude,
      };
      lastCoordinatesRef.current = coordinates;

      const watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5_000,
          distanceInterval: 20,
        },
        (position) => {
          if (!isCurrentAttempt()) return;
          const nextCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          lastCoordinatesRef.current = nextCoordinates;
          void publishLocation(nextCoordinates);
        },
        (watchError) => {
          if (!isCurrentAttempt()) return;
          console.error('[Becho] Live location updates stopped:', watchError);
          setErrorMessage(t('liveUpdatesStopped'));
          void stopSharing();
        }
      );
      if (!isCurrentAttempt()) {
        watch.remove();
        return;
      }
      watchRef.current = watch;

      await publishLocation(coordinates);
      if (!isCurrentAttempt()) return;

      heartbeatRef.current = setInterval(() => {
        if (isCurrentAttempt() && lastCoordinatesRef.current) {
          void publishLocation(lastCoordinatesRef.current);
        }
      }, HEARTBEAT_MS);
    } catch (locationError) {
      if (!isCurrentAttempt()) return;
      console.error('[Becho] Could not start live location sharing:', locationError);
      await stopSharing();
      if (mountedRef.current) setErrorMessage(t('locationStartError'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const openPeerLocation = async () => {
    if (!peerLocation) return;
    const url = `https://maps.google.com/?q=${peerLocation.latitude},${peerLocation.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (openError) {
      console.error('[Becho] Could not open the shared map location:', openError);
      setErrorMessage(t('mapsOpenError'));
    }
  };

  return (
    <View
      className="mx-3 mb-2 rounded-xl border p-3"
      style={{ backgroundColor: `${theme.surface}E6`, borderColor: theme.border }}
    >
      <View className="flex-row items-start">
        <Ionicons name="location-outline" size={18} color={theme.primary} />
        <View className="ml-2 flex-1">
          <Text className="text-xs font-bold text-white">{t('liveLocation')}</Text>
          <Text className="mt-1 text-[11px] leading-4 text-gray-400">
            {t('locationSharingHint')}
          </Text>
        </View>
        {ownLocation ? (
          <TouchableOpacity
            onPress={() => void stopSharing()}
            className="ml-2 rounded-lg bg-rose-500/15 px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel={t('stopSharingLocation')}
          >
            <Text className="text-[11px] font-bold text-rose-200">{t('stop')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => void startSharing()}
            disabled={!channelReady || busy}
            className="ml-2 rounded-lg px-3 py-2"
            style={{ backgroundColor: `${theme.primary}1A` }}
            accessibilityRole="button"
            accessibilityLabel={t('shareLocation')}
          >
            <Text className="text-[11px] font-bold" style={{ color: theme.primary }}>
              {busy ? t('starting') : channelReady ? t('share') : t('connecting')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {!!ownLocation && (
        <Text className="mt-2 text-[10px] font-medium" style={{ color: theme.primary }}>
          {t('locationShared')}
        </Text>
      )}
      {!!peerLocation && (
        <TouchableOpacity
          onPress={() => void openPeerLocation()}
          className="mt-3 flex-row items-center rounded-lg border px-3 py-2"
          style={{ borderColor: `${theme.primary}33`, backgroundColor: `${theme.primary}14` }}
          accessibilityRole="button"
          accessibilityLabel={t('openMaps')}
        >
          <Ionicons name="navigate-outline" size={15} color={theme.primary} />
          <Text className="ml-2 flex-1 text-xs font-semibold" style={{ color: theme.primary }}>
            {t('peerSharingLocation')}
          </Text>
          <Ionicons name="open-outline" size={14} color={theme.primary} />
        </TouchableOpacity>
      )}
      {!!errorMessage && (
        <Text accessibilityRole="alert" className="mt-2 text-[11px] leading-4 text-amber-200">
          {errorMessage}
        </Text>
      )}
    </View>
  );
}
