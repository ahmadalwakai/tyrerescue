import { Alert, StyleSheet, Text, Vibration, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/context';
import {
  AdminShell,
  GlassCard,
  PressScale,
  ToolCard,
  colors,
  spacing,
  typography,
} from '@/ui';

type ToolItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'muted';
  action: () => void;
};

export default function MoreScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout } = useAuth();

  const unavailable = (title: string) => {
    Alert.alert(title, 'No connected mobile admin endpoint is available for this tool in the current build.');
  };

  const clearCache = () => {
    Alert.alert('Clear Local Cache', 'This clears cached admin data on this device. You will stay signed in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear cache',
        style: 'destructive',
        onPress: () => {
          queryClient.clear();
          Alert.alert('Cache cleared', 'Local query cache has been cleared.');
        },
      },
    ]);
  };

  const operationTools: ToolItem[] = [
    {
      id: 'ai',
      title: 'AI Assistant',
      subtitle: 'Smart recommendations',
      icon: 'sparkles',
      accent: 'purple',
      action: () => router.push('/(tabs)/ops/chat'),
    },
    {
      id: 'reports',
      title: 'Reports',
      subtitle: 'Detailed analytics',
      icon: 'document-text',
      accent: 'blue',
      action: () => router.push('/(tabs)/insights/analytics'),
    },
    {
      id: 'revenue',
      title: 'Revenue',
      subtitle: 'Financial overview',
      icon: 'bar-chart',
      accent: 'green',
      action: () => router.push('/(tabs)/finance'),
    },
    {
      id: 'messages',
      title: 'Messages',
      subtitle: 'Team communication',
      icon: 'chatbubbles',
      accent: 'orange',
      action: () => router.push('/(tabs)/ops/messages'),
    },
    {
      id: 'settings',
      title: 'Settings',
      subtitle: 'App preferences',
      icon: 'settings',
      accent: 'muted',
      action: () => unavailable('Settings'),
    },
    {
      id: 'support',
      title: 'Support',
      subtitle: 'Help & support',
      icon: 'help-circle',
      accent: 'blue',
      action: () => unavailable('Support'),
    },
  ];

  const systemTools: ToolItem[] = [
    {
      id: 'sync',
      title: 'Sync Data',
      subtitle: 'Refresh all cached admin data',
      icon: 'sync',
      accent: 'blue',
      action: () => {
        queryClient.invalidateQueries();
        Alert.alert('Sync started', 'Admin data is refreshing.');
      },
    },
    {
      id: 'backup',
      title: 'Backup',
      subtitle: 'No backup endpoint connected',
      icon: 'cloud-upload',
      accent: 'muted',
      action: () => unavailable('Backup'),
    },
    {
      id: 'status',
      title: 'System Status',
      subtitle: 'Check current service availability',
      icon: 'shield-checkmark',
      accent: 'green',
      action: () => Alert.alert('System Status', 'The mobile API is reachable when dashboard data loads successfully.'),
    },
    {
      id: 'sound',
      title: 'Test Sound',
      subtitle: 'No sound module connected',
      icon: 'volume-high',
      accent: 'orange',
      action: () => unavailable('Test Sound'),
    },
    {
      id: 'vibration',
      title: 'Test Vibration',
      subtitle: 'Trigger device vibration',
      icon: 'phone-portrait',
      accent: 'purple',
      action: () => Vibration.vibrate([0, 180, 80, 180]),
    },
    {
      id: 'lock',
      title: 'Test Lock Screen Alert',
      subtitle: 'No lock screen module connected',
      icon: 'lock-closed',
      accent: 'red',
      action: () => unavailable('Test Lock Screen Alert'),
    },
    {
      id: 'permission',
      title: 'Notification Permission Check',
      subtitle: 'No permission module connected',
      icon: 'notifications',
      accent: 'blue',
      action: () => unavailable('Notification Permission Check'),
    },
    {
      id: 'cache',
      title: 'Clear Local Cache',
      subtitle: 'Requires confirmation',
      icon: 'trash',
      accent: 'red',
      action: clearCache,
    },
  ];

  return (
    <AdminShell title="More" subtitle="Tools & settings">
      <Text style={styles.sectionTitle}>Operations Tools</Text>
      <View style={styles.toolsGrid}>
        {operationTools.map((tool, index) => (
          <ToolCard
            key={tool.id}
            title={tool.title}
            subtitle={tool.subtitle}
            icon={tool.icon}
            accent={tool.accent}
            onPress={tool.action}
            animatedIndex={index}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>System</Text>
      <GlassCard accent="blue" animatedIndex={operationTools.length}>
        {systemTools.map((tool, index) => (
          <PressScale key={tool.id} style={[styles.systemRow, index > 0 && styles.systemRowBorder]} onPress={tool.action}>
            <View style={styles.systemIcon}>
              <Ionicons name={tool.icon} size={17} color={colors.textSecondary} />
            </View>
            <View style={styles.systemText}>
              <Text style={styles.systemTitle}>{tool.title}</Text>
              <Text style={styles.systemSubtitle}>{tool.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </PressScale>
        ))}
      </GlassCard>

      <GlassCard accent="red" animatedIndex={operationTools.length + 1}>
        <PressScale
          style={styles.signOutButton}
          onPress={async () => {
            await logout();
            router.replace('/(auth)/login');
          }}
        >
          <Ionicons name="log-out" size={18} color={colors.text} />
          <Text style={styles.signOutText}>Sign out</Text>
        </PressScale>
      </GlassCard>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  systemRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  systemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  systemIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemText: {
    flex: 1,
    minWidth: 0,
  },
  systemTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  systemSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  signOutButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  signOutText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
});
