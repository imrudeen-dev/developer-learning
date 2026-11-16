import { StyleSheet, Text, View } from 'react-native';
import { BECHO_COLORS } from '../../lib/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Becho — Buy • Sell • Rent</Text>
      <Text style={styles.sub}>Home feed skeleton ready (Step 2.2)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BECHO_COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { color: BECHO_COLORS.text, fontSize: 22, fontWeight: '700' },
  sub: { color: BECHO_COLORS.textMuted, marginTop: 8 },
});