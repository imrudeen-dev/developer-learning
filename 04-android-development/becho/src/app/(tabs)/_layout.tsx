import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

function resolveIconColor(color: unknown, fallback: string): string {
  return typeof color === 'string' && color.length > 0 ? color : fallback;
}

export default function TabsLayout() {
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const bottomClearance = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 3,
        },
        tabBarItemStyle: {
          paddingTop: 6,
          paddingBottom: 4,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: bottomClearance,
          height: 64,
          borderRadius: 24,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 6,
          ...getCardElevation(theme),
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => {
            const tint = resolveIconColor(color, c.primary);
            return (
              <View
                style={[
                  dockStyles.pill,
                  focused && { backgroundColor: c.primaryMuted },
                ]}
              >
                <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={tint} />
              </View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: 'Post Ad',
          tabBarIcon: ({ color, focused }) => {
            const tint = resolveIconColor(color, c.primary);
            return (
              <View
                style={[
                  dockStyles.pill,
                  focused && { backgroundColor: c.primaryMuted },
                ]}
              >
                <Ionicons
                  name={focused ? 'add-circle' : 'add-circle-outline'}
                  size={21}
                  color={tint}
                />
              </View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => {
            const tint = resolveIconColor(color, c.primary);
            return (
              <View
                style={[
                  dockStyles.pill,
                  focused && { backgroundColor: c.primaryMuted },
                ]}
              >
                <Ionicons
                  name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                  size={20}
                  color={tint}
                />
              </View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => {
            const tint = resolveIconColor(color, c.primary);
            return (
              <View
                style={[
                  dockStyles.pill,
                  focused && { backgroundColor: c.primaryMuted },
                ]}
              >
                <Ionicons
                  name={focused ? 'person' : 'person-outline'}
                  size={20}
                  color={tint}
                />
              </View>
            );
          },
        }}
      />
    </Tabs>
  );
}

const dockStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});