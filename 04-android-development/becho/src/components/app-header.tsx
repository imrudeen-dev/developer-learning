import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPreferences } from '../lib/app-preferences';
import { isPlatformOwner, useAuth } from '../lib/auth-context';
import { useNotificationCenter } from '../lib/notification-center';
import { usePlatformSettings } from '../lib/platform-settings';
import { TourTarget, useAppTour } from '../lib/tour-context';
import { AppText as Text } from './app-text';

const navigationItems = [
  { path: '/', translation: 'explore', icon: 'compass-outline' },
  { path: '/chats', translation: 'chats', icon: 'chatbubbles-outline' },
  { path: '/orders', translation: 'activity', icon: 'albums-outline' },
  { path: '/profile', translation: 'profile', icon: 'person-circle-outline' },
  { path: '/settings', translation: 'settings', icon: 'settings-outline' },
] as const;

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { theme, t } = useAppPreferences();
  const { user } = useAuth();
  const { settings } = usePlatformSettings();
  const { unreadCount } = useNotificationCenter();
  const { startTour } = useAppTour();
  const [menuVisible, setMenuVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const canCreate = settings.allow_listings || isPlatformOwner(user);
  const showMenu = Platform.OS !== 'web' || width < 1024;

  const navigate = (path: (typeof navigationItems)[number]['path'] | '/(tabs)/post') => {
    setMenuVisible(false);
    router.push(path);
  };

  return (
    <>
      <View
        className="flex-row items-center border-b px-3 py-2.5"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          paddingTop: Math.max(insets.top, 0) + 10,
        }}
      >
        {showMenu && (
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            className="mr-3 h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: theme.background }}
            accessibilityRole="button"
            accessibilityLabel={t('openMenu')}
          >
            <Ionicons name="menu-outline" size={23} color={theme.primary} />
          </TouchableOpacity>
        )}
        <View className="flex-1">
          <Text className="text-lg font-black tracking-tight text-white">Becho</Text>
          <Text className="text-[10px] text-gray-400">{t('tagline')}</Text>
        </View>
        <TouchableOpacity
          onPress={startTour}
          className="mr-2 h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.background }}
          accessibilityRole="button"
          accessibilityLabel={t('guidedTour')}
        >
          <Ionicons name="help-circle-outline" size={20} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/notifications')}
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.background }}
          accessibilityRole="button"
          accessibilityLabel={t('notifications')}
        >
          <Ionicons name="notifications-outline" size={19} color={theme.primary} />
          {unreadCount > 0 && (
            <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible && showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View className="flex-1 flex-row bg-black/60">
          <View
            className="h-full border-r px-4 pb-6"
            style={{
              width: Math.min(width * 0.84, 320),
              backgroundColor: theme.surface,
              borderColor: theme.border,
              paddingTop: Math.max(insets.top, 0) + 20,
            }}
          >
            <View className="mb-6 flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-black text-white">Becho</Text>
                <Text className="mt-1 text-[11px] text-gray-400">{t('tagline')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMenuVisible(false)}
                className="h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: theme.background }}
                accessibilityRole="button"
                accessibilityLabel={t('closeMenu')}
              >
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            {navigationItems.map((item) => {
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
                  onPress={() => navigate(item.path)}
                  className="mb-1 min-h-12 flex-row items-center rounded-xl px-3"
                  style={{ backgroundColor: active ? `${theme.primary}1A` : 'transparent' }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? theme.primary : '#9ca3af'}
                  />
                  <Text
                    className="ml-3 text-sm font-semibold"
                    style={{ color: active ? theme.primary : '#e5e7eb' }}
                  >
                    {t(item.translation)}
                  </Text>
                </TouchableOpacity>
              );
              return targetId ? (
                <TourTarget key={item.path} id={targetId} style={{ width: '100%' }}>
                  {navigationButton}
                </TourTarget>
              ) : (
                <React.Fragment key={item.path}>{navigationButton}</React.Fragment>
              );
            })}

            <TourTarget id="nav-create" style={{ width: '100%' }}>
              <TouchableOpacity
                onPress={() => navigate('/(tabs)/post')}
                disabled={!canCreate}
                className="mt-3 min-h-12 flex-row items-center justify-center rounded-xl px-3"
                style={{ backgroundColor: theme.primary, opacity: canCreate ? 1 : 0.55 }}
                accessibilityRole="button"
                accessibilityLabel={t('createListing')}
              >
                <Ionicons name="add" size={19} color="#052e16" />
                <Text className="ml-2 text-sm font-bold text-[#052e16]">{t('createListing')}</Text>
              </TouchableOpacity>
            </TourTarget>

            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false);
                startTour();
              }}
              className="mt-2 min-h-12 flex-row items-center rounded-xl px-3"
              style={{ backgroundColor: theme.background }}
              accessibilityRole="button"
            >
              <Ionicons name="help-circle-outline" size={20} color={theme.primary} />
              <Text className="ml-3 text-sm font-semibold text-white">{t('guidedTour')}</Text>
            </TouchableOpacity>

            <View className="mt-auto rounded-2xl border p-3" style={{ borderColor: theme.border }}>
              <Text className="text-xs font-semibold text-gray-300">{t('meetSafely')}</Text>
              <Text className="mt-1 text-[11px] leading-4 text-gray-500">
                {t('neighborhoodMarketplace')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            className="flex-1"
            onPress={() => setMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t('closeMenu')}
          />
        </View>
      </Modal>
    </>
  );
}

export function AppFooter() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { theme, t } = useAppPreferences();
  const { user } = useAuth();
  const { settings } = usePlatformSettings();
  const insets = useSafeAreaInsets();
  const canCreate = settings.allow_listings || isPlatformOwner(user);
  const showMobileNavigation = Platform.OS !== 'web' || width < 1024;

  if (!showMobileNavigation) {
    return (
      <View
        className="flex-row items-center justify-between border-t px-5"
        style={{
          minHeight: 38 + (Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 0)),
          paddingBottom: Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 0),
          backgroundColor: theme.surface,
          borderColor: theme.border,
        }}
      >
        <Text className="text-[11px] font-semibold text-gray-300">{t('meetSafely')}</Text>
        <Text className="text-[10px] text-gray-500">{t('neighborhoodMarketplace')}</Text>
      </View>
    );
  }

  if (pathname.startsWith('/chat/')) return null;

  const items = [
    { path: '/', translation: 'explore', icon: 'compass-outline', targetId: 'nav-explore' },
    { path: '/chats', translation: 'chats', icon: 'chatbubbles-outline', targetId: 'nav-chats' },
    { path: '/(tabs)/post', translation: 'create', icon: 'add-circle-outline', targetId: 'nav-create' },
    { path: '/orders', translation: 'activity', icon: 'albums-outline', targetId: 'nav-activity' },
    { path: '/profile', translation: 'profile', icon: 'person-circle-outline', targetId: 'nav-profile' },
  ] as const;

  return (
    <View
      className="flex-row items-center justify-around border-t px-1 pt-2"
      style={{
        paddingBottom: Math.max(insets.bottom, 8),
        minHeight: 58 + Math.max(insets.bottom, 8),
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
    >
      {items.map((item) => {
        const active =
          item.path === '/'
            ? pathname === '/' || pathname === '/index'
            : item.path === '/(tabs)/post'
              ? pathname === '/post'
              : pathname.startsWith(item.path);
        const isCreate = item.path === '/(tabs)/post';
        return (
          <TourTarget
            key={item.path}
            id={item.targetId}
            style={{ minWidth: 58, flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <TouchableOpacity
              onPress={() => router.push(item.path)}
              disabled={isCreate && !canCreate}
              className="min-h-12 w-full items-center justify-center"
              style={{ opacity: isCreate && !canCreate ? 0.45 : 1 }}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: isCreate && !canCreate }}
              accessibilityLabel={t(item.translation)}
            >
              <Ionicons
                name={item.icon}
                size={isCreate ? 25 : 20}
                color={active || isCreate ? theme.primary : '#9ca3af'}
              />
              <Text
                className="mt-0.5 text-[10px] font-semibold"
                style={{ color: active ? theme.primary : '#9ca3af' }}
              >
                {t(item.translation)}
              </Text>
            </TouchableOpacity>
          </TourTarget>
        );
      })}
    </View>
  );
}
