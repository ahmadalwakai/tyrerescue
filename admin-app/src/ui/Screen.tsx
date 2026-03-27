import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/ui/theme';

interface ScreenProps extends PropsWithChildren {
  contentStyle?: ViewStyle;
  /**
   * When true, content is vertically centered — suitable for auth screens.
   */
  centered?: boolean;
}

/**
 * Screen - Main screen wrapper with safe area, scrollable content
 * Provides consistent dark background and padding
 */
export function Screen({ children, contentStyle, centered }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, centered && styles.contentCentered, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={centered ? styles.centeredInner : undefined}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  contentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centeredInner: {
    width: '100%',
  },
});
