import { StyleSheet, Text, View } from 'react-native';
import { BECHO_COLORS } from '../../lib/theme';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>
      <Text style={styles.sub}>Auth & My Ads coming in Step 4.1 & 4.5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BECHO_COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { color: BECHO_COLORS.text, fontSize: 22, fontWeight: '700' },
  sub: { color: BECHO_COLORS.textMuted, marginTop: 8 },
});