import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/app-text';
import { TourTarget } from '../lib/tour-context';
import { useAuth } from '../lib/auth-context';
import {
  APP_THEMES,
  type AppThemeId,
  useAppPreferences,
  type TranslationKey,
} from '../lib/app-preferences';
import { supabase } from '../lib/supabase';

const THEME_OPTIONS: { id: AppThemeId; label: TranslationKey }[] = [
  { id: 'emerald', label: 'themeEmerald' },
  { id: 'ocean', label: 'themeOcean' },
  { id: 'violet', label: 'themeViolet' },
  { id: 'light', label: 'themeLight' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, themeId, setThemeId, language, setLanguage, t } = useAppPreferences();
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setCity(profile?.city ?? '');
  }, [profile]);

  const saveAccountDetails = async () => {
    if (!user) return;
    if (!name.trim()) {
      setErrorMessage(t('nameRequired'));
      return;
    }

    setSaving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: name.trim(),
          phone: phone.trim() || null,
          city: city.trim() || null,
        })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setStatusMessage(t('settingsSaved'));
    } catch (saveError) {
      console.error('[Becho] Could not update account settings:', saveError);
      setErrorMessage(t('settingsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 36, alignItems: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-3xl">
        <View className="mb-6">
          <Text className="text-2xl font-extrabold text-white">{t('settings')}</Text>
          <Text className="mt-1 text-sm text-gray-400">{t('settingsSubtitle')}</Text>
        </View>

        <TourTarget id="settings-account" style={{ width: '100%' }}>
          <View
            className="mb-5 rounded-3xl border p-5"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              elevation: 4,
            }}
          >
            <View className="mb-4 flex-row items-center">
              <View
                className="mr-3 h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${theme.primary}24` }}
              >
                <Ionicons name="person-outline" size={20} color={theme.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">{t('accountSettings')}</Text>
                <Text className="mt-0.5 text-xs text-gray-400">{t('profileDetails')}</Text>
              </View>
            </View>

            {user ? (
              <>
                <Text className="mb-2 text-xs font-semibold text-gray-400">{t('emailAddress')}</Text>
                <View
                  className="mb-4 rounded-xl border px-3 py-3"
                  style={{ backgroundColor: theme.background, borderColor: theme.border }}
                >
                  <Text className="text-sm text-gray-400">{user.email}</Text>
                </View>

                <Text className="mb-2 text-xs font-semibold text-gray-400">{t('displayName')}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('yourName')}
                  className="mb-3 rounded-xl border px-3 py-3 text-white"
                  style={{ backgroundColor: theme.background, borderColor: theme.border }}
                  accessibilityLabel={t('displayName')}
                />

                <Text className="mb-2 text-xs font-semibold text-gray-400">{t('phoneNumber')}</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t('phonePlaceholder')}
                  keyboardType="phone-pad"
                  className="mb-3 rounded-xl border px-3 py-3 text-white"
                  style={{ backgroundColor: theme.background, borderColor: theme.border }}
                  accessibilityLabel={t('phoneNumber')}
                />

                <Text className="mb-2 text-xs font-semibold text-gray-400">{t('city')}</Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder={t('cityPlaceholder')}
                  className="mb-4 rounded-xl border px-3 py-3 text-white"
                  style={{ backgroundColor: theme.background, borderColor: theme.border }}
                  accessibilityLabel={t('city')}
                />

                {!!statusMessage && (
                  <Text accessibilityRole="text" className="mb-3 text-sm text-emerald-500">
                    {statusMessage}
                  </Text>
                )}
                {!!errorMessage && (
                  <Text accessibilityRole="alert" className="mb-3 text-sm text-red-400">
                    {errorMessage}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => void saveAccountDetails()}
                  disabled={saving}
                  className="min-h-12 flex-row items-center justify-center rounded-xl px-4"
                  style={{ backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }}
                  accessibilityRole="button"
                >
                  {saving && <ActivityIndicator size="small" color={theme.isLight ? '#fff' : '#052e16'} />}
                  <Text
                    className={`font-bold ${saving ? 'ml-2' : ''}`}
                    style={{ color: theme.isLight ? '#fff' : '#052e16' }}
                  >
                    {saving ? t('saving') : t('saveProfile')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="mb-4 text-sm leading-6 text-gray-400">{t('signInHint')}</Text>
                <TouchableOpacity
                  onPress={() => router.push('/profile')}
                  className="min-h-11 flex-row items-center justify-center rounded-xl px-4"
                  style={{ backgroundColor: theme.primary }}
                  accessibilityRole="button"
                >
                  <Text
                    className="font-bold"
                    style={{ color: theme.isLight ? '#fff' : '#052e16' }}
                  >
                    {t('goToSignIn')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TourTarget>

        <TourTarget id="settings-appearance" style={{ width: '100%' }}>
          <View
            className="mb-5 rounded-3xl border p-5"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              elevation: 4,
            }}
          >
            <View className="mb-4 flex-row items-center">
              <View
                className="mr-3 h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${theme.primary}24` }}
              >
                <Ionicons name="color-palette-outline" size={20} color={theme.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-white">{t('appearanceSettings')}</Text>
                <Text className="mt-0.5 text-xs text-gray-400">{t('personalization')}</Text>
              </View>
            </View>

            <Text className="mb-2 text-xs font-semibold text-gray-400">{t('colorTheme')}</Text>
            <View className="flex-row flex-wrap">
              {THEME_OPTIONS.map(({ id, label }) => (
                <TouchableOpacity
                  key={id}
                  onPress={() => setThemeId(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: themeId === id }}
                  accessibilityLabel={t(label)}
                  className="mb-2 mr-2 flex-row items-center rounded-full border px-3 py-2"
                  style={{
                    backgroundColor: themeId === id ? `${theme.primary}1A` : 'transparent',
                    borderColor: themeId === id ? theme.primary : theme.border,
                  }}
                >
                  <View
                    className="mr-2 h-3 w-3 rounded-full"
                    style={{ backgroundColor: APP_THEMES[id].primary }}
                  />
                  <Text className="text-xs font-semibold text-white">{t(label)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="mb-2 mt-4 text-xs font-semibold text-gray-400">{t('language')}</Text>
            <View className="flex-row">
              {(['en', 'ta'] as const).map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setLanguage(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: language === option }}
                  accessibilityLabel={option === 'en' ? t('english') : t('tamil')}
                  className="mr-2 rounded-full border px-4 py-2"
                  style={{
                    backgroundColor: language === option ? theme.primary : theme.background,
                    borderColor: language === option ? theme.primary : theme.border,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: language === option ? (theme.isLight ? '#fff' : '#052e16') : theme.text }}
                  >
                    {option === 'en' ? t('english') : t('tamil')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TourTarget>
      </View>
    </ScrollView>
  );
}
