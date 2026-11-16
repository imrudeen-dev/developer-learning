import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BECHO_COLORS } from '../lib/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={BECHO_COLORS.surface} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}