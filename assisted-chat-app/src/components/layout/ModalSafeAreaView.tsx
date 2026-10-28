import { StyleSheet } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';

/**
 * A native Modal has a separate view hierarchy from the app's root provider.
 * Measure its own safe area so iOS headers and home-indicator padding use the
 * presented view's insets, including after rotation.
 */
export function ModalSafeAreaView({ style, ...props }: SafeAreaViewProps) {
  return (
    <SafeAreaProvider style={styles.fill}>
      <SafeAreaView {...props} style={[styles.fill, style]} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
