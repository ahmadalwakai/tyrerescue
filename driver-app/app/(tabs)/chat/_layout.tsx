import { Stack } from 'expo-router';
import { colors, fontSize } from '@/constants/theme';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'Inter_700Bold', fontSize: fontSize.lg },
      }}
    />
  );
}
