import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors } from '@/ui/theme';

export default function FinanceHomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Finance and pricing</Text>
      <Text style={styles.subtitle}>Rules, surcharge configuration, slots, and invoices</Text>

      <Card>
        <PrimaryButton title="Pricing" onPress={() => router.push('/(tabs)/finance/pricing')} />
        <PrimaryButton title="Availability" onPress={() => router.push('/(tabs)/finance/availability')} />
        <PrimaryButton title="Invoices" onPress={() => router.push('/(tabs)/finance/invoices')} />
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
    color: colors.muted,
  },
});
