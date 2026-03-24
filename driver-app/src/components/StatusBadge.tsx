import { View, Text, StyleSheet } from 'react-native';
import { fontSize, radius, statusColors } from '@/constants/theme';
import { useI18n } from '@/i18n';

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config = statusColors[status] ?? { bg: '#3F3F46', text: '#A1A1AA', label: status };
  const translatedLabel = t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : config.label;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{translatedLabel}</Text>
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
