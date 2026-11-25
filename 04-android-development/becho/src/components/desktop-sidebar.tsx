import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { AppText as Text } from './app-text';
import { useAppPreferences } from '../lib/app-preferences';
import { isPlatformOwner, useAuth } from '../lib/auth-context';
import { usePlatformSettings } from '../lib/platform-settings';
import { TourTarget } from '../lib/tour-context';

const SIDEBAR_WIDTH = 248;

export function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { theme, t } = useAppPreferences();
  const { user } = useAuth();
  const { settings } = usePlatformSettings();

  if (Platform.OS !== 'web' || width < 1024) return null;

  const items: { path: '/' | '/chats' | '/orders' | '/profile' | '/settings'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { path: '/', label: t('explore'), icon: 'compass-outline' },
    { path: '/chats', label: t('chats'), icon: 'chatbubbles-outline' },
    { path: '/orders', label: t('activity'), icon: 'albums-outline' },
    { path: '/profile', label: t('profile'), icon: 'person-circle-outline' },
    { path: '/settings', label: t('settings'), icon: 'settings-outline' },
  ];
  const canCreate = settings.allow_listings || isPlatformOwner(user);

  return (
    <View
      accessibilityLabel="Main navigation"
      style={{
        width: SIDEBAR_WIDTH,
        padding: 18,
        borderRightWidth: 1,
        borderRightColor: theme.border,
        backgroundColor: `${theme.surface}F2`,
        zIndex: 2,
      }}
    >
      <TourTarget id="nav-create" className="mb-6 w-full">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/post')}
          disabled={!canCreate}
          accessibilityRole="button"
          accessibilityLabel={t('createListing')}
          className="min-h-12 flex-row items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.primary, opacity: canCreate ? 1 : 0.55 }}
        >
          <Ionicons name="add" size={19} color="#052e16" />
          <Text className="ml-2 text-sm font-bold text-[#052e16]">{t('createListing')}</Text>
        </TouchableOpacity>
      </TourTarget>

      <Text className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[1.4px] text-gray-500">
        {t('marketplace')}
      </Text>
      {items.map((item) => {
        const active =
          item.path === '/'
            ? pathname === '/' || pathname === '/index'
            : pathname.startsWith(item.path);
        const targetId =
          item.path === '/chats'
            ? 'nav-chats'
            : item.path === '/orders'
              ? 'nav-activity'
              : item.path === '/profile'
                ? 'nav-profile'
                : item.path === '/'
                  ? 'nav-explore'
                  : null;
        const navigationButton = (
          <TouchableOpacity
            onPress={() => router.push(item.path)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            className="mb-1 min-h-11 flex-row items-center rounded-xl px-3"
            style={{ backgroundColor: active ? `${theme.primary}1A` : 'transparent' }}
          >
            <Ionicons name={item.icon} size={19} color={active ? theme.primary : '#9ca3af'} />
            <Text
              className="ml-3 text-sm font-semibold"
              style={{ color: active ? theme.primary : '#d1d5db' }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
        return targetId ? (
          <TourTarget key={item.path} id={targetId} className="w-full">
            {navigationButton}
          </TourTarget>
        ) : (
          <View key={item.path} className="w-full">{navigationButton}</View>
        );
      })}
    </View>
  );
}
