import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

export default function ProfileScreen() {
  const { user, profile, loading, refreshProfile } = useAuth();

  // Auth form state
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('Chennai');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditName(profile.full_name ?? '');
      setEditPhone(profile.phone ?? '');
      setEditCity(profile.city ?? 'Chennai');
    }
  }, [profile]);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    if (isSignUp && !fullName.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        Alert.alert('Welcome to Becho!', 'Your account has been created.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      Alert.alert('Authentication Error', err.message ?? 'Something went wrong');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName.trim(),
          phone: editPhone.trim(),
          city: editCity.trim() || 'Chennai',
        })
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      Alert.alert('Saved', 'Your profile details have been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message ?? 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
      </View>
    );
  }

  // LOGGED-OUT VIEW: Sign In / Create Account
  if (!user) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BECHO_COLORS.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.logoBadge}>
            <Ionicons name="storefront-outline" size={34} color={BECHO_COLORS.primary} />
          </View>
          <Text style={styles.brandTitle}>
            {isSignUp ? 'Create your Becho account' : 'Sign in to Becho'}
          </Text>
          <Text style={styles.brandSub}>
            Buy, sell, and rent locally with instant chat.
          </Text>

          {isSignUp && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Imrudeen"
                placeholderTextColor={BECHO_COLORS.textMuted}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={BECHO_COLORS.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              placeholderTextColor={BECHO_COLORS.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, authSubmitting && { opacity: 0.7 }]}
            onPress={handleAuth}
            disabled={authSubmitting}
          >
            {authSubmitting ? (
              <ActivityIndicator color="#052E16" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => setIsSignUp((prev) => !prev)}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "New to Becho? Create an account"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // LOGGED-IN VIEW: Account Details + Sign Out
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.profileContainer}>
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {(profile?.full_name || user.email || 'B')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{profile?.full_name || 'Becho Member'}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Seller & Contact Details</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="Your name"
            placeholderTextColor={BECHO_COLORS.textMuted}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone Number (optional)</Text>
          <TextInput
            style={styles.input}
            value={editPhone}
            onChangeText={setEditPhone}
            placeholder="+91 98765 43210"
            placeholderTextColor={BECHO_COLORS.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Default City</Text>
          <TextInput
            style={styles.input}
            value={editCity}
            onChangeText={setEditCity}
            placeholder="Chennai"
            placeholderTextColor={BECHO_COLORS.textMuted}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, savingProfile && { opacity: 0.7 }]}
          onPress={handleSaveProfile}
          disabled={savingProfile}
        >
          {savingProfile ? (
            <ActivityIndicator color="#052E16" />
          ) : (
            <Text style={styles.primaryBtnText}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={BECHO_COLORS.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: BECHO_COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  authContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  profileContainer: { padding: 16, gap: 16 },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandTitle: { color: BECHO_COLORS.text, fontSize: 24, fontWeight: '800' },
  brandSub: { color: BECHO_COLORS.textMuted, fontSize: 14, marginTop: 6, marginBottom: 24 },
  card: {
    backgroundColor: BECHO_COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    padding: 16,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: BECHO_COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: BECHO_COLORS.primary, fontSize: 22, fontWeight: '800' },
  userName: { color: BECHO_COLORS.text, fontSize: 18, fontWeight: '700' },
  userEmail: { color: BECHO_COLORS.textMuted, fontSize: 13, marginTop: 2 },
  sectionTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 14 },
  fieldGroup: { marginBottom: 14 },
  label: { color: BECHO_COLORS.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: BECHO_COLORS.text,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: BECHO_COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: '#052E16', fontSize: 15, fontWeight: '800' },
  switchBtn: { marginTop: 18, alignItems: 'center' },
  switchText: { color: BECHO_COLORS.primary, fontSize: 14, fontWeight: '600' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
  },
  signOutText: { color: BECHO_COLORS.danger, fontSize: 15, fontWeight: '700' },
});