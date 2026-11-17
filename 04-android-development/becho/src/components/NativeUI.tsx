import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableOpacityProps,
    View,
} from 'react-native';
import { useBechoTheme } from '../lib/theme';

interface HapticButtonProps extends TouchableOpacityProps {
  hapticStyle?: 'light' | 'medium' | 'selection';
}

export function HapticButton({
  onPress,
  hapticStyle = 'light',
  style,
  children,
  ...rest
}: HapticButtonProps) {
  const handlePress = (e: any) => {
    if (hapticStyle === 'selection') {
      Haptics.selectionAsync().catch(() => {});
    } else if (hapticStyle === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.(e);
  };

  return (
    <TouchableOpacity activeOpacity={0.82} onPress={handlePress} style={style} {...rest}>
      {children}
    </TouchableOpacity>
  );
}

export function BechoLogoMark({ size = 38 }: { size?: number }) {
  const { theme } = useBechoTheme();
  const inner = Math.round(size * 0.56);

  return (
    <View
      style={[
        logoStyles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: theme.colors.primaryMuted,
          borderColor: theme.colors.primary,
        },
      ]}
    >
      <Ionicons name="bag-handle" size={inner} color={theme.colors.primary} />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  badge: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ListingSkeletonGrid() {
  const { theme } = useBechoTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.9],
  });

  return (
    <View style={skeletonStyles.grid}>
      {[0, 1, 2, 3].map((idx) => (
        <Animated.View
          key={idx}
          style={[
            skeletonStyles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity,
            },
          ]}
        >
          <View
            style={[skeletonStyles.image, { backgroundColor: theme.colors.shimmerBase }]}
          />
          <View style={skeletonStyles.body}>
            <View
              style={[
                skeletonStyles.lineWide,
                { backgroundColor: theme.colors.shimmerHighlight },
              ]}
            />
            <View
              style={[
                skeletonStyles.lineMid,
                { backgroundColor: theme.colors.shimmerBase },
              ]}
            />
            <View
              style={[
                skeletonStyles.lineShort,
                { backgroundColor: theme.colors.shimmerBase },
              ]}
            />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  card: {
    width: '48.2%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 136,
  },
  body: {
    padding: 12,
    gap: 8,
  },
  lineWide: {
    height: 14,
    width: '65%',
    borderRadius: 6,
  },
  lineMid: {
    height: 12,
    width: '92%',
    borderRadius: 6,
  },
  lineShort: {
    height: 10,
    width: '50%',
    borderRadius: 6,
  },
});

export function ScreenHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
}) {
  const { theme } = useBechoTheme();

  return (
    <View
      style={[
        headerStyles.wrap,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={headerStyles.side}>{leftAction}</View>
      <View style={headerStyles.center}>
        <Text
          style={[headerStyles.title, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[headerStyles.subtitle, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[headerStyles.side, { alignItems: 'flex-end' }]}>{rightAction}</View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  side: {
    minWidth: 42,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});