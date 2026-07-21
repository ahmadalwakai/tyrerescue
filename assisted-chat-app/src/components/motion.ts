import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(Boolean(enabled));
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
      setReducedMotion(Boolean(enabled));
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
}

export function useFadeSlideIn({
  delay = 0,
  distance = 10,
  duration = 260,
}: {
  delay?: number;
  distance?: number;
  duration?: number;
} = {}) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(distance));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [delay, duration, opacity, reducedMotion, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}

export function usePressScale(disabled: boolean, pressedScale = 0.97) {
  const [scale] = useState(() => new Animated.Value(1));

  const animateTo = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: toValue < 1 ? 90 : 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  return {
    pressScaleStyle: { transform: [{ scale }] },
    pressIn: () => {
      if (!disabled) animateTo(pressedScale);
    },
    pressOut: () => {
      animateTo(1);
    },
  };
}

export function useLoopingPulse({
  active = true,
  duration = 1800,
  min = 0,
  max = 1,
}: {
  active?: boolean;
  duration?: number;
  min?: number;
  max?: number;
} = {}) {
  const [value] = useState(() => new Animated.Value(min));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active || reducedMotion) {
      value.setValue(min);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: max,
          duration: duration / 2,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(value, {
          toValue: min,
          duration: duration / 2,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, max, min, reducedMotion, value]);

  return value;
}
