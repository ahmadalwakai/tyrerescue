import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors } from '@/ui/theme';

export default function InsightsHomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.subtitle}>Analytics, SEO telemetry, and audit history</Text>

      <Card>
        <PrimaryButton title="Analytics" onPress={() => router.push('/(tabs)/insights/analytics')} />
        <PrimaryButton title="SEO" onPress={() => router.push('/(tabs)/insights/seo')} />
        <PrimaryButton title="Audit" onPress={() => router.push('/(tabs)/insights/audit')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.textMuted,
  },
});
