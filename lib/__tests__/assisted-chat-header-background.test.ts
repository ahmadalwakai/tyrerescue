import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(root, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');
const locationSectionPath = path.join(root, 'assisted-chat-app/src/components/LocationSection.tsx');
const appConfigPath = path.join(root, 'assisted-chat-app/app.json');
const imageAssetPath = path.join(root, 'assisted-chat-app/assets/images/assisted-chat-header.png');
const staleLocationBackgroundPath = path.join(root, 'assisted-chat-app/assets/images/location-card-background.png');

const assistedChatScreenSource = () => fs.readFileSync(assistedChatScreenPath, 'utf8');
const locationSectionSource = () => fs.readFileSync(locationSectionPath, 'utf8');

describe('Assisted Chat header background', () => {
  it('uses the bundled PNG image instead of the previous video background', () => {
    const source = assistedChatScreenSource();
    const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));

    expect(fs.existsSync(imageAssetPath)).toBe(true);
    expect(source).toContain("import assistedChatHeaderImageSource from '../../assets/images/assisted-chat-header.png'");
    expect(source).toContain('<HeaderImageBackground />');
    expect(source).toContain('source={assistedChatHeaderImageSource}');
    expect(source).toContain('styles.headerFeaturedImage');
    expect(source).toContain('resizeMode="cover"');
    expect(source).toContain('resizeMode="contain"');
    expect(source).not.toContain('assisted-chat-header.mp4');
    expect(source).not.toContain("createElement('video'");
    expect(source).not.toContain('HeaderVideoBackground');
    expect(source).not.toContain('assisted-chat-header-video');
    expect(appConfig.expo.assetBundlePatterns).toBeUndefined();
  });

  it('does not keep a duplicate Location hero background', () => {
    const locationSource = locationSectionSource();
    const assistedSource = assistedChatScreenSource();
    const locationPanelStyle = locationSource.match(/locationPanel:\s*\{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(fs.existsSync(staleLocationBackgroundPath)).toBe(false);
    expect(locationSource).not.toContain('ImageBackground');
    expect(locationSource).not.toContain('location-card-background');
    expect(locationSource).not.toContain('<View style={styles.locationPanelSoftLight}');
    expect(locationSource).not.toContain('<View style={styles.locationPanelTexture}');
    expect(locationPanelStyle).not.toContain('colors.glowBorder');
    expect(assistedSource).not.toContain('location-card-background');
  });

  it('keeps the main screen free of shared chrome backgrounds during overscroll', () => {
    const assistedSource = assistedChatScreenSource();

    expect(assistedSource).not.toContain('AdminChromeBackdrop');
    expect(assistedSource).toContain('bounces={false}');
    expect(assistedSource).toContain('alwaysBounceVertical={false}');
    expect(assistedSource).toContain('overScrollMode="never"');
  });
});
