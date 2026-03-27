import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, colors, radius, spacing, typography } from '@/ui';

type MoreSection = {
  title: string;
  items: Array<{
    id: string;
    label: string;
    description: string;
    route: '/(tabs)/ops' | '/(tabs)/finance' | '/(tabs)/cms' | '/(tabs)/insights';
  }>;
};

const MORE_SECTIONS: MoreSection[] = [
  {
    title: 'Operations & Dispatch',
    items: [
      {
        id: 'ops',
        label: 'Operations',
        description: 'Manage live jobs, dispatch, and driver activity',
        route: '/(tabs)/ops',
      },
    ],
  },
  {
    title: 'Finance & Billing',
    items: [
      {
        id: 'finance',
        label: 'Finance',
        description: 'Revenue reports, invoices, and refund history',
        route: '/(tabs)/finance',
      },
    ],
  },
  {
    title: 'Content & CMS',
    items: [
      {
        id: 'cms',
        label: 'Content',
        description: 'Manage tyre listings, pricing, and service areas',
        route: '/(tabs)/cms',
      },
    ],
  },
  {
    title: 'Analytics',
    items: [
      {
        id: 'insights',
        label: 'Analytics',
        description: 'Traffic, conversion, and booking performance insights',
        route: '/(tabs)/insights',
      },
    ],
  },
];

/**
 * More screen — secondary navigation for overflow modules.
 * All items here are navigable but hidden from the primary tab bar.
 */
export default function MoreScreen() {
  const router = useRouter();

  return (
    <Screen>
      {MORE_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.menuGroup}>
            {section.items.map((item, index) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.menuItem,
                  index < section.items.length - 1 && styles.menuItemDivider,
                  pressed && styles.menuItemPressed,
                ]}
                onPress={() => router.push(item.route)}
              >
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                  <Text style={styles.menuItemDescription}>{item.description}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  menuGroup: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  menuItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceLight,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  menuItemDescription: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
