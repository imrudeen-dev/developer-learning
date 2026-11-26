import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText as Text } from '../components/app-text';
import { useAppPreferences, type TranslationKey } from './app-preferences';

const TOUR_KEY = 'becho_onboarding_v5';

type TourRoute = '/' | '/chats' | '/orders' | '/profile' | '/settings' | '/(tabs)/post';
type TourTargetId =
  | 'home-search'
  | 'home-offer-type'
  | 'home-categories'
  | 'nav-explore'
  | 'nav-create'
  | 'nav-chats'
  | 'nav-activity'
  | 'nav-profile'
  | 'profile-settings'
  | 'settings-account'
  | 'settings-appearance';

interface TourStep {
  targetId: TourTargetId;
  route: TourRoute;
  title: TranslationKey;
  description: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: 'home-search',
    route: '/',
    title: 'tourSearchTitle',
    description: 'tourSearchDescription',
    icon: 'search-outline',
  },
  {
    targetId: 'home-offer-type',
    route: '/',
    title: 'tourOfferTitle',
    description: 'tourOfferDescription',
    icon: 'swap-horizontal-outline',
  },
  {
    targetId: 'home-categories',
    route: '/',
    title: 'tourCategoriesTitle',
    description: 'tourCategoriesDescription',
    icon: 'grid-outline',
  },
  {
    targetId: 'nav-create',
    route: '/',
    title: 'tourCreateTitle',
    description: 'tourCreateDescription',
    icon: 'add-circle-outline',
  },
  {
    targetId: 'nav-chats',
    route: '/chats',
    title: 'tourChatsTitle',
    description: 'tourChatsDescription',
    icon: 'chatbubbles-outline',
  },
  {
    targetId: 'nav-activity',
    route: '/orders',
    title: 'tourActivityTitle',
    description: 'tourActivityDescription',
    icon: 'albums-outline',
  },
  {
    targetId: 'nav-profile',
    route: '/profile',
    title: 'tourProfileTitle',
    description: 'tourProfileDescription',
    icon: 'person-circle-outline',
  },
  {
    targetId: 'profile-settings',
    route: '/profile',
    title: 'tourSettingsTitle',
    description: 'tourSettingsDescription',
    icon: 'settings-outline',
  },
  {
    targetId: 'settings-account',
    route: '/settings',
    title: 'accountSettings',
    description: 'settingsSubtitle',
    icon: 'person-outline',
  },
  {
    targetId: 'settings-appearance',
    route: '/settings',
    title: 'appearanceSettings',
    description: 'tourSettingsDescription',
    icon: 'color-palette-outline',
  },
];

interface TourContextValue {
  activeTargetId: TourTargetId | null;
  registerTarget: (id: TourTargetId, rect: TargetRect) => void;
  startTour: () => void;
}

const TourContext = createContext<TourContextValue>({
  activeTargetId: null,
  registerTarget: () => {},
  startTour: () => {},
});

interface TourTargetProps {
  id: TourTargetId;
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function TourTarget({ id, children, className, style }: TourTargetProps) {
  const ref = useRef<React.ElementRef<typeof View>>(null);
  const { activeTargetId, registerTarget } = useAppTour();

  const measureTarget = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) registerTarget(id, { x, y, width, height });
    });
  }, [id, registerTarget]);

  useLayoutEffect(() => {
    if (activeTargetId === id) measureTarget();
  }, [activeTargetId, id, measureTarget]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={measureTarget}
      className={className}
      style={style}
    >
      {children}
    </View>
  );
}

export function AppTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const { theme, t } = useAppPreferences();
  const [visible, setVisible] = useState(false);
  const [autoStartPending, setAutoStartPending] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRects, setTargetRects] = useState<Partial<Record<TourTargetId, TargetRect>>>({});
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const registerTarget = useCallback((id: TourTargetId, rect: TargetRect) => {
    setTargetRects((current) => {
      const previous = current[id];
      if (
        previous &&
        Math.abs(previous.x - rect.x) < 1 &&
        Math.abs(previous.y - rect.y) < 1 &&
        Math.abs(previous.width - rect.width) < 1 &&
        Math.abs(previous.height - rect.height) < 1
      ) {
        return current;
      }
      return { ...current, [id]: rect };
    });
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(TOUR_KEY)
      .then((seen) => {
        if (!active || seen === 'complete') return;
        setStep(0);
        setAutoStartPending(true);
        if (pathRef.current !== TOUR_STEPS[0].route) router.replace(TOUR_STEPS[0].route);
      })
      .catch((error: unknown) => {
        console.error('[Becho] Could not load onboarding status:', error);
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!autoStartPending || !targetRects['home-search']) return;
    setAutoStartPending(false);
    setVisible(true);
  }, [autoStartPending, targetRects]);

  const startTour = useCallback(() => {
    setAutoStartPending(false);
    setStep(0);
    setVisible(true);
    setTargetRects({});
    if (pathRef.current !== TOUR_STEPS[0].route) router.replace(TOUR_STEPS[0].route);
  }, [router]);

  const closeTour = useCallback(async () => {
    setAutoStartPending(false);
    setVisible(false);
    setTargetRects({});
    try {
      await AsyncStorage.setItem(TOUR_KEY, 'complete');
    } catch (error) {
      console.error('[Becho] Could not save onboarding status:', error);
    }
  }, []);

  const moveToStep = useCallback(
    (nextStep: number) => {
      const next = TOUR_STEPS[nextStep];
      if (!next) return;
      setStep(nextStep);
      if (pathRef.current !== next.route) router.replace(next.route);
    },
    [router]
  );

  const advance = useCallback(() => {
    if (step === TOUR_STEPS.length - 1) {
      void closeTour();
    } else {
      moveToStep(step + 1);
    }
  }, [closeTour, moveToStep, step]);

  const currentStep = TOUR_STEPS[step];
  const target = targetRects[currentStep.targetId];
  const targetPadding = 7;
  const targetLeft = target ? Math.max(0, target.x - targetPadding) : 0;
  const targetTop = target ? Math.max(0, target.y - targetPadding) : 0;
  const targetRight = target ? Math.min(width, target.x + target.width + targetPadding) : 0;
  const targetBottom = target ? Math.min(height, target.y + target.height + targetPadding) : 0;
  const cardWidth = Math.min(width - 32, 440);
  const estimatedCardHeight = Math.min(300, height - 32);
  const cardBelowTarget = target ? targetBottom + estimatedCardHeight + 16 <= height - 12 : false;
  const cardTop = target
    ? cardBelowTarget
      ? targetBottom + 16
      : Math.max(12, targetTop - estimatedCardHeight - 16)
    : Math.max(16, (height - estimatedCardHeight) / 2);

  return (
    <TourContext.Provider
      value={{
        activeTargetId: visible ? currentStep.targetId : null,
        registerTarget,
        startTour,
      }}
    >
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void closeTour()}>
        <View className="flex-1">
          {!target ? (
            <View
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
            />
          ) : (
            <>
              <View
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: targetTop, backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
              />
              <View
                style={{ position: 'absolute', top: targetTop, left: 0, width: targetLeft, height: targetBottom - targetTop, backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
              />
              <View
                style={{ position: 'absolute', top: targetTop, left: targetRight, right: 0, height: targetBottom - targetTop, backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
              />
              <View
                style={{ position: 'absolute', top: targetBottom, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
              />
              <TouchableOpacity
                onPress={advance}
                accessibilityRole="button"
                accessibilityLabel={t('next')}
                style={{
                  position: 'absolute',
                  left: targetLeft,
                  top: targetTop,
                  width: targetRight - targetLeft,
                  height: targetBottom - targetTop,
                  borderWidth: 2,
                  borderColor: theme.primary,
                  borderRadius: 14,
                  backgroundColor: 'transparent',
                  elevation: 10,
                }}
              />
            </>
          )}

          <View
            className="absolute rounded-3xl border p-5"
            style={{
              left: (width - cardWidth) / 2,
              top: cardTop,
              width: cardWidth,
              maxHeight: height - 24,
              backgroundColor: theme.surface,
              borderColor: theme.border,
              elevation: 12,
            }}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View
                  className="mr-3 h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${theme.primary}24` }}
                >
                  <Ionicons name={currentStep.icon} size={21} color={theme.primary} />
                </View>
                <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.primary }}>
                  {step + 1} / {TOUR_STEPS.length}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => void closeTour()}
                accessibilityRole="button"
                accessibilityLabel={t('skip')}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: `${theme.text}12` }}
              >
                <Text className="text-xs font-semibold text-gray-300">{t('skip')}</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-xl font-extrabold text-white">{t(currentStep.title)}</Text>
            <Text className="mt-2 text-sm leading-6 text-gray-300">{t(currentStep.description)}</Text>
            <Text className="mt-3 text-xs leading-5 text-gray-400">{t('tourNextHint')}</Text>
            <View className="mt-5 flex-row items-center justify-between">
              {step > 0 ? (
                <TouchableOpacity
                  onPress={() => moveToStep(step - 1)}
                  accessibilityRole="button"
                  className="min-h-11 flex-row items-center rounded-xl border px-4"
                  style={{ borderColor: theme.border }}
                >
                  <Ionicons name="arrow-back" size={15} color={theme.text} />
                  <Text className="ml-2 text-sm font-semibold text-white">{t('back')}</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity
                onPress={advance}
                accessibilityRole="button"
                className="min-h-11 flex-row items-center rounded-xl px-5"
                style={{ backgroundColor: theme.primary }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: theme.isLight ? '#fff' : '#052e16' }}
                >
                  {step === TOUR_STEPS.length - 1 ? t('getStarted') : t('next')}
                </Text>
                {step < TOUR_STEPS.length - 1 && (
                  <Ionicons
                    name="arrow-forward"
                    size={15}
                    color={theme.isLight ? '#fff' : '#052e16'}
                    style={{ marginLeft: 8 }}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </TourContext.Provider>
  );
}

export function useAppTour() {
  return useContext(TourContext);
}
