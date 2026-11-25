import { Tabs } from 'expo-router';
import { useAppPreferences } from '../../lib/app-preferences';
import { isPlatformOwner, useAuth } from '../../lib/auth-context';
import { usePlatformSettings } from '../../lib/platform-settings';

export default function TabsLayout() {
  const { theme } = useAppPreferences();
  const { user } = useAuth();
  const { settings } = usePlatformSettings();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none', backgroundColor: theme.surface, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="post" options={{ href: settings.allow_listings || isPlatformOwner(user) ? undefined : null }} />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
