import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import nativeScanner from '../modules/customer-tyre-scanner';
import { withDeadline } from './booking-safety';
import { findTyreSizeCandidates, type TyreSizeCandidate } from './customer-tyre-size-scan';
import { colors, radii, typography } from './theme';
import type { TyreSize } from './types';
import { InlineNotice, PrimaryButton } from './ui';

type ScanResult = { revision: number; uri: string; candidates: TyreSizeCandidate[]; selected: string | null };
type Props = {
  sizeKey: string;
  disabled?: boolean;
  onConfirm: (size: TyreSize) => void;
  onBusyChange: (busy: boolean) => void;
};

export function CustomerTyreScanner({ sizeKey, disabled = false, onConfirm, onBusyChange }: Props) {
  const [phase, setPhase] = useState<'idle' | 'picking' | 'reading'>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const busy = useRef(false);
  const currentSize = useRef(sizeKey);
  const previousSize = useRef(sizeKey);
  currentSize.current = sizeKey;

  useEffect(() => {
    const requestGeneration = generation;
    mounted.current = true;
    return () => { mounted.current = false; requestGeneration.current++; };
  }, []);

  useEffect(() => {
    if (previousSize.current === sizeKey) return;
    previousSize.current = sizeKey;
    generation.current++;
    busy.current = false;
    setPhase('idle'); setResult(null); setError(''); setShowSettings(false);
    onBusyChange(false);
  }, [sizeKey, onBusyChange]);

  function dismiss() {
    generation.current++;
    busy.current = false;
    setPhase('idle'); setResult(null); setError(''); setShowSettings(false);
    onBusyChange(false);
  }

  async function scan(camera: boolean) {
    if (busy.current || disabled || !nativeScanner.isSupported()) return;
    const revision = ++generation.current;
    const requestedSize = sizeKey;
    const current = () => mounted.current && generation.current === revision && currentSize.current === requestedSize;
    busy.current = true;
    onBusyChange(true);
    setPhase('picking'); setResult(null); setError(''); setShowSettings(false);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!current()) return;
        if (!permission.granted) {
          setError('Camera access is off. Choose a photo or enter the size by hand.');
          setShowSettings(permission.canAskAgain === false);
          return;
        }
      }
      // The system photo picker grants access to the selected image only.
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!current() || picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) {
        setError('Choose a photo smaller than 20 MB, or take a closer photo of the size.');
        return;
      }
      setPhase('reading');
      const text = await withDeadline(nativeScanner.recognizeText(asset.uri), 15_000, 'Scan timed out');
      if (!current()) return;
      const candidates = findTyreSizeCandidates(text);
      setResult({ revision, uri: asset.uri, candidates, selected: candidates.length === 1 ? candidates[0].label : null });
    } catch {
      if (current()) setError('We could not read this photo. Try a clear, close-up photo of the full size, choose another photo, or enter it by hand.');
    } finally {
      if (current()) {
        busy.current = false;
        setPhase('idle');
        onBusyChange(false);
      }
    }
  }

  if (!nativeScanner.isSupported()) return null;
  const selected = result?.candidates.find(candidate => candidate.label === result.selected);
  return <View style={styles.container}>
    <Text style={styles.title} accessibilityRole="header">Read size from a photo</Text>
    <Text style={styles.detail}>Photograph the full marking on the side of your tyre, such as 205/55 R16. Scanning happens on your phone.</Text>
    <PrimaryButton icon="camera" variant="secondary" disabled={disabled || phase !== 'idle'} onPress={() => void scan(true)}>Scan tyre size</PrimaryButton>
    <PrimaryButton icon="image" variant="ghost" disabled={disabled || phase !== 'idle'} onPress={() => void scan(false)}>Choose a photo to scan</PrimaryButton>
    {phase !== 'idle' ? <>
      <Text style={styles.detail} accessibilityLiveRegion="polite">{phase === 'reading' ? 'Reading the tyre marking…' : 'Choose a clear photo of the tyre size…'}</Text>
      <PrimaryButton variant="ghost" onPress={dismiss}>Cancel scan</PrimaryButton>
    </> : null}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    {showSettings ? <PrimaryButton variant="ghost" icon="settings" onPress={() => { void Linking.openSettings().catch(() => {
      if (mounted.current) setError('Open your phone settings to allow camera access, or choose a photo instead.');
    }); }}>Open camera settings</PrimaryButton> : null}
    {result ? <View style={styles.review}>
      <Image source={{ uri: result.uri }} resizeMode="contain" style={styles.photo} accessibilityLabel="Tyre photo for checking the suggested size" />
      {result.candidates.length ? <>
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">{result.candidates.length === 1 ? 'Check the suggested size' : 'More than one size found'}</Text>
        <Text style={styles.detail}>Compare every number with your tyre. Front and rear tyres may have different sizes.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Sizes read from your photo" style={styles.options}>
          {result.candidates.map(candidate => <Pressable key={candidate.label} accessibilityRole="radio"
            accessibilityLabel={candidate.label} accessibilityState={{ checked: candidate.label === result.selected, disabled }} disabled={disabled}
            onPress={() => setResult(previous => previous ? { ...previous, selected: candidate.label } : null)}
            style={[styles.option, candidate.label === result.selected ? styles.selected : null]}>
            <Text style={styles.size}>{candidate.label}</Text>
            {candidate.label === result.selected ? <Text style={styles.detail}>Selected</Text> : null}
          </Pressable>)}
        </View>
        <PrimaryButton icon="check" disabled={disabled || !selected} onPress={() => {
          if (!selected || disabled || busy.current || !mounted.current || result.revision !== generation.current || currentSize.current !== sizeKey) return;
          dismiss();
          onConfirm({ width: selected.width, aspect: selected.aspect, rim: selected.rim });
        }}>Confirm and use this size</PrimaryButton>
      </> : <InlineNotice>No complete tyre size was found. Try a closer photo in good light, enter the size by hand, or choose “I don&apos;t know my tyre size” for help.</InlineNotice>}
      <PrimaryButton variant="ghost" onPress={dismiss}>Enter size by hand</PrimaryButton>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  title: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 16 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  review: { gap: 12 },
  photo: { width: '100%', height: 200, borderRadius: radii.lg, backgroundColor: colors.bg },
  options: { gap: 8 },
  option: { padding: 14, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  size: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 20 },
});
