import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export type ListingType = 'SELL' | 'RENT';
export type RentPeriod = 'DAY' | 'WEEK' | 'MONTH';
export type ThemeId = 'obsidian' | 'midnight' | 'daylight';

export interface BechoTheme {
  id: ThemeId;
  name: string;
  tagline: string;
  isDark: boolean;
  statusBarStyle: 'light' | 'dark';
  colors: {
    bg: string;
    surface: string;
    surfaceElevated: string;
    surfacePressed: string;
    border: string;
    borderStrong: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    primary: string;
    primaryText: string;
    primaryMuted: string;
    rentBadge: string;
    rentText: string;
    sellBadge: string;
    sellText: string;
    success: string;
    warning: string;
    danger: string;
    overlay: string;
    shimmerBase: string;
    shimmerHighlight: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
}

export const BECHO_THEMES: Record<ThemeId, BechoTheme> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Emerald',
    tagline: 'Deep slate with crisp emerald accents',
    isDark: true,
    statusBarStyle: 'light',
    colors: {
      bg: '#0B1120',
      surface: '#111827',
      surfaceElevated: '#1E293B',
      surfacePressed: '#263449',
      border: '#1F2937',
      borderStrong: '#334155',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      primary: '#22C55E',
      primaryText: '#03261B',
      primaryMuted: '#14532D',
      rentBadge: '#38BDF8',
      rentText: '#04253A',
      sellBadge: '#F59E0B',
      sellText: '#271702',
      success: '#22C55E',
      warning: '#F59E0B',
      danger: '#EF4444',
      overlay: 'rgba(4, 7, 13, 0.78)',
      shimmerBase: '#162033',
      shimmerHighlight: '#24334F',
    },
    spacing: { xs: 4, sm: 8, md: 14, lg: 18, xl: 24 },
    radius: { sm: 8, md: 12, lg: 16, xl: 22, full: 999 },
  },
  midnight: {
    id: 'midnight',
    name: 'Royal Indigo',
    tagline: 'Rich navy contrast for low-light browsing',
    isDark: true,
    statusBarStyle: 'light',
    colors: {
      bg: '#090916',
      surface: '#13132B',
      surfaceElevated: '#1C1C3E',
      surfacePressed: '#262652',
      border: '#25254D',
      borderStrong: '#383870',
      text: '#F5F5FF',
      textSecondary: '#C7C7E8',
      textMuted: '#8282AD',
      primary: '#818CF8',
      primaryText: '#0E0B38',
      primaryMuted: '#26265E',
      rentBadge: '#38BDF8',
      rentText: '#04253A',
      sellBadge: '#FBBF24',
      sellText: '#271702',
      success: '#34D399',
      warning: '#FBBF24',
      danger: '#F87171',
      overlay: 'rgba(6, 6, 18, 0.8)',
      shimmerBase: '#191938',
      shimmerHighlight: '#282856',
    },
    spacing: { xs: 4, sm: 8, md: 14, lg: 18, xl: 24 },
    radius: { sm: 8, md: 12, lg: 16, xl: 22, full: 999 },
  },
  daylight: {
    id: 'daylight',
    name: 'Chennai Daylight',
    tagline: 'High-contrast crisp light mode for outdoors',
    isDark: false,
    statusBarStyle: 'dark',
    colors: {
      bg: '#F3F6FA',
      surface: '#FFFFFF',
      surfaceElevated: '#F8FAFC',
      surfacePressed: '#EBF0F6',
      border: '#E2E8F0',
      borderStrong: '#CBD5E1',
      text: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      primary: '#059669',
      primaryText: '#FFFFFF',
      primaryMuted: '#D1FAE5',
      rentBadge: '#0284C7',
      rentText: '#FFFFFF',
      sellBadge: '#D97706',
      sellText: '#FFFFFF',
      success: '#059669',
      warning: '#D97706',
      danger: '#DC2626',
      overlay: 'rgba(15, 23, 42, 0.55)',
      shimmerBase: '#E2E8F0',
      shimmerHighlight: '#F1F5F9',
    },
    spacing: { xs: 4, sm: 8, md: 14, lg: 18, xl: 24 },
    radius: { sm: 8, md: 12, lg: 16, xl: 22, full: 999 },
  },
};

export const BECHO_COLORS = BECHO_THEMES.obsidian.colors;

export function getCardElevation(theme: BechoTheme) {
  if (Platform.OS === 'android') {
    return {
      elevation: theme.isDark ? 3 : 2,
    };
  }
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: theme.isDark ? 0.28 : 0.08,
    shadowRadius: 10,
  };
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: BechoTheme;
  setThemeId: (id: ThemeId) => Promise<void>;
}

const THEME_STORAGE_KEY = 'becho_theme_preference_v1';

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'obsidian',
  theme: BECHO_THEMES.obsidian,
  setThemeId: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('obsidian');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'obsidian' || saved === 'midnight' || saved === 'daylight') {
          setThemeIdState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setThemeId = async (next: ThemeId) => {
    setThemeIdState(next);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo(
    () => ({
      themeId,
      theme: BECHO_THEMES[themeId],
      setThemeId,
    }),
    [themeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useBechoTheme() {
  return useContext(ThemeContext);
}