import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ActionTile, SectionHeader, colors, spacing } from '@/ui';

const MORE_MENU_ITEMS = [
  {
    id: 'ops',
    label: 'Operations',
    icon: '⚙️',
    route: '/(tabs)/ops',
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: '💰',
    route: '/(tabs)/finance',
  },
  {
    id: 'cms',
    label: 'Content',
    icon: '📝',
    route: '/(tabs)/cms',
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: '📊',
    route: '/(tabs)/insights',
  },
];

/**
 * More Menu - Secondary navigation for less frequently used features
 */
export default function MoreScreen() {
  const router = useRouter();

  const handleMenuPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeader title="More Options" />

      <View style={styles.grid}>
        {MORE_MENU_ITEMS.map((item) => (
          <View key={item.id} style={styles.tileContainer}>
            <ActionTile
              title={item.label}
              icon={<Text style={styles.iconText}>{item.icon}</Text>}
              onPress={() => handleMenuPress(item.route)}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.md,
  },
  tileContainer: {
    width: '50%',
    paddingHorizontal: spacing.md,
  },
  iconText: {
    fontSize: 28,
  },
});
