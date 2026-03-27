import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors } from '@/ui/theme';

export default function CmsHomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Content management</Text>
      <Text style={styles.subtitle}>Rules, FAQ entries, and testimonials moderation</Text>

      <Card>
        <PrimaryButton title="Pricing Rules" onPress={() => router.push('/(tabs)/cms/content')} />
        <PrimaryButton title="FAQ" onPress={() => router.push('/(tabs)/cms/faq')} />
        <PrimaryButton title="Testimonials" onPress={() => router.push('/(tabs)/cms/testimonials')} />
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
