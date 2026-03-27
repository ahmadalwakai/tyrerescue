import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors } from '@/ui/theme';

export default function OpsHomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Operations</Text>
      <Text style={styles.subtitle}>Callbacks, contact messages, chat, and alert center</Text>

      <Card>
        <PrimaryButton title="Callbacks" onPress={() => router.push('/(tabs)/ops/callbacks')} />
        <PrimaryButton title="Messages" onPress={() => router.push('/(tabs)/ops/messages')} />
        <PrimaryButton title="Chat" onPress={() => router.push('/(tabs)/ops/chat')} />
        <PrimaryButton title="Notifications" onPress={() => router.push('/(tabs)/ops/notifications')} />
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
    fontSize: 13,
  },
});
