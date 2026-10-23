import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DriverNavigationMapProps } from './DriverNavigationMap.types';

/** Browser fallback never imports a native map module or the old WebView map. */
export default function DriverNavigationMap(props: DriverNavigationMapProps) {
  const { onReady } = props;
  useEffect(() => { onReady(); }, [onReady]);
  return <View style={styles.root}>
    <Ionicons name="map-outline" size={42} color="#1A73E8" />
    <Text style={styles.title}>Navigation is ready in the iPhone app</Text>
    <Text style={styles.body}>Open the native app for the live map and spoken directions.</Text>
    <Pressable accessibilityRole="button" onPress={props.onOpenExternal} style={styles.button}>
      <Ionicons name="navigate" size={20} color="#FFFFFF" /><Text style={styles.buttonText}>Open directions</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: '#172337' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center', color: '#52647B' },
  button: { minHeight: 52, backgroundColor: '#1A73E8', paddingHorizontal: 22, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
