import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    TouchableOpacityProps,
    View,
    ViewStyle,
} from 'react-native';
import AnimatedReanimated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBechoTheme } from '../lib/theme';

const ReanimatedPressable = AnimatedReanimated.createAnimatedComponent(Pressable);

interface HapticButtonProps extends TouchableOpacityProps {
  hapticStyle?: 'light' | 'medium' | 'selection';
  scaleTo?: number;
}

export function HapticButton({
  onPress,
  hapticStyle = 'light',
  scaleTo = 0.97,
  style,
  children,
  disabled,
  ...rest
}: HapticButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const triggerHaptic = () => {
    if (hapticStyle === 'selection') {
      Haptics.selectionAsync().catch(() => {});
    } else if (hapticStyle === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <ReanimatedPressable
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) {
          scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 280 });
      }}
      onPress={(e) => {
        if (disabled) return;
        triggerHaptic();
        onPress?.(e as any);
      }}
      style={[animatedStyle, style as ViewStyle]}
      {...(rest as any)}
    >
      {children}
    </ReanimatedPressable>
  );
}

export function BechoLogoMark({ size = 38 }: { size?: number }) {
  const { theme } = useBechoTheme();
  const inner = Math.round(size * 0.54);

  return (
    <View
      style={[
        logoStyles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: theme.colors.primary,
        },
      ]}
    >
      <Ionicons name="bag-handle" size={inner} color={theme.colors.primaryText} />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface NativeInputProps extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightElement?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function NativeInput({
  label,
  icon,
  rightElement,
  containerStyle,
  style,
  ...rest
}: NativeInputProps) {
  const { theme } = useBechoTheme();
  const c = theme.colors;
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[inputStyles.label, { color: c.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          inputStyles.field,
          {
            backgroundColor: c.surfaceElevated,
            borderColor: focused ? c.primary : 'transparent',
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? c.primary : c.textMuted}
          />
        ) : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={c.textMuted}
          style={[inputStyles.input, { color: c.text }, style]}
        />
        {rightElement}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
});

export function NativeBottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[sheetStyles.backdrop, { backgroundColor: c.overlay }]}
        onPress={onClose}
      >
        <Pressable
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: c.surface,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: Math.max(insets.bottom, 20) + 8,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[sheetStyles.handle, { backgroundColor: c.borderStrong }]} />
          <View style={sheetStyles.headerRow}>
            <Text style={[sheetStyles.sheetTitle, { color: c.text }]}>{title}</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onClose();
              }}
              style={[sheetStyles.closeBtn, { backgroundColor: c.surfaceElevated }]}
            >
              <Ionicons name="close" size={18} color={c.textSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    borderRadius: 18,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 140,
  },
  body: {
    padding: 12,
    gap: 8,
  },
  lineWide: {
    height: 15,
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
          backgroundColor: theme.colors.bg,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  side: {
    minWidth: 42,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});