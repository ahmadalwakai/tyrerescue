import { View, Text, StyleSheet } from 'react-native';
import { fontSize, radius, statusColors } from '@/constants/theme';

export function StatusBadge({ status }: { status: string }) {
  const config = statusColors[status] ?? { bg: '#3F3F46', text: '#A1A1AA', label: status };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter_600SemiBold',
  },
});
