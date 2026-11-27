import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useAppPreferences } from '../lib/app-preferences';

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Slight scale + opacity feedback on press */
  interactive?: boolean;
  /** Stronger blur-style border for elevated cards */
  elevated?: boolean;
};

/**
 * Soft glass surface used across Becho.
 * Uses theme surface + border tokens (already rgba) for a glassmorphism look
 * without native blur dependencies.
 */
export function GlassCard({
  children,
  style,
  contentStyle,
  onPress,
  interactive = false,
  elevated = false,
}: GlassCardProps) {
  const { theme } = useAppPreferences();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      friction: 7,
      tension: 160,
    }).start();
  };

  const cardStyle: ViewStyle = {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    ...(elevated
      ? {
          shadowColor: '#000',
          shadowOpacity: theme.isLight ? 0.08 : 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }
      : {}),
  };

  if (onPress || interactive) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        <Animated.View style={[{ transform: [{ scale }] }, cardStyle, style]}>
          <View style={contentStyle}>{children}</View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={[cardStyle, style]}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}
