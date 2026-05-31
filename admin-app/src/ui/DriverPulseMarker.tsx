import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * Staggered radar / sonar pulse marker.
 *
 * Two concentric rings expand outward and fade from the centre dot. The
 * second ring starts 800ms after the first so the signal reads as a
 * continuous "live" sweep rather than a single blink.
 */
interface DriverPulseMarkerProps {
  /** Centre dot + ring colour. */
  color: string;
  /** Diameter of the outer pulse at full expansion (px). */
  size?: number;
  /**
   * When false, only the static centre dot renders (no expanding rings).
   * Used for offline drivers to avoid the continuous redraw cost.
   */
  pulsing?: boolean;
}

const DURATION = 2000;
const STAGGER = 800;

function useRingAnimation(delay: number, enabled: boolean) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION,
        delay,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress, delay, enabled]);

  return progress;
}

export function DriverPulseMarker({ color, size = 64, pulsing = true }: DriverPulseMarkerProps) {
  const ring1 = useRingAnimation(0, pulsing);
  const ring2 = useRingAnimation(STAGGER, pulsing);

  const ringStyle = (progress: Animated.Value) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45, 0],
    }),
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.2, 1],
        }),
      },
    ],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {pulsing && (
        <>
          <Animated.View style={[styles.ring, ringStyle(ring1)]} />
          <Animated.View style={[styles.ring, ringStyle(ring2)]} />
        </>
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
