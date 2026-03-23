import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '@/constants/theme';

export default function UpdateRequiredScreen() {
  const { url, latest, notes } = useLocalSearchParams<{
    url?: string;
    latest?: string;
    notes?: string;
  }>();

  const handleUpdate = () => {
    const downloadUrl =
      url || (Platform.OS === 'android'
        ? 'https://tyrerescue.co.uk/driver-app'
        : 'https://tyrerescue.co.uk/driver-app');
    Linking.openURL(downloadUrl);
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-download-outline" size={64} color={colors.accent} />
      </View>

      <Text style={styles.heading}>Update Required</Text>

      <Text style={styles.body}>
        A new version of the Tyre Rescue Driver app is available
        {latest ? ` (v${latest})` : ''}.{'\n\n'}
        Please update to continue using the app.
      </Text>

      {notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>What's new</Text>
          <Text style={styles.notesBody}>{notes}</Text>
        </View>
      ) : null}

      <Pressable style={styles.updateBtn} onPress={handleUpdate}>
        <Ionicons name="download-outline" size={20} color="#FFFFFF" />
        <Text style={styles.updateBtnText}>Download Update</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(234,88,12,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heading: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  notesCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  notesTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 4,
  },
  notesBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    width: '100%',
  },
  updateBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: '#FFFFFF',
  },
});
