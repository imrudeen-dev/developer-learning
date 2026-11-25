import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { AppText as Text } from './app-text';
import { useAppPreferences } from '../lib/app-preferences';
import { useNotificationCenter } from '../lib/notification-center';

interface NotificationBellProps {
  onPress: () => void;
  className?: string;
  iconColor?: string;
  iconSize?: number;
}

export function NotificationBell({
  onPress,
  className = '',
  iconColor = 'white',
  iconSize = 20,
}: NotificationBellProps) {
  const { unreadCount } = useNotificationCenter();
  const { theme, t } = useAppPreferences();

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`relative h-10 w-10 items-center justify-center rounded-full ${className}`}
      style={{ backgroundColor: theme.surface }}
      accessibilityRole="button"
      accessibilityLabel={`${t('notifications')}${unreadCount ? `, ${unreadCount} unread` : ''}`}
    >
      <Ionicons name="notifications-outline" size={iconSize} color={iconColor} />
      {unreadCount > 0 && (
        <View
          className="absolute -right-1 -top-1 min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 bg-rose-500 px-1"
          style={{ borderColor: theme.background }}
        >
          <Text className="text-[9px] font-extrabold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
