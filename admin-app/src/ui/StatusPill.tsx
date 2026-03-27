import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/ui/theme';

interface Props {
  label: string;
}

function getTone(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('cancel') || normalized.includes('failed') || normalized.includes('refund')) {
    return { bg: '#FDEBEA', text: colors.danger };
  }
  if (normalized.includes('complete') || normalized.includes('paid') || normalized.includes('resolved')) {
    return { bg: '#E9F8F0', text: colors.success };
  }
  if (normalized.includes('pending') || normalized.includes('warning')) {
    return { bg: '#FFF5E6', text: colors.warning };
  }
  return { bg: '#E8F1FC', text: colors.primary };
}

export function StatusPill({ label }: Props) {
  const tone = getTone(label);

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}> 
      <Text style={[styles.text, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
