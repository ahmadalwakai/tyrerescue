import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HEADER_VIDEO_STARTUP_TIMEOUT_MS,
  buildHeaderVideoHtml,
  getHeaderVideoReadAccessUri,
  parseHeaderVideoWebViewMessage,
  shouldShowHeaderVideoFallback,
  validateHeaderVideoUri,
} from '../../assisted-chat-app/src/lib/header-video';

const root = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(root, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');
const locationSectionPath = path.join(root, 'assisted-chat-app/src/components/LocationSection.tsx');
const appConfigPath = path.join(root, 'assisted-chat-app/app.json');
const videoAssetPath = path.join(root, 'assisted-chat-app/assets/video/assisted-chat-header.mp4');
const staleLocationBackgroundPath = path.join(root, 'assisted-chat-app/assets/images/location-card-background.png');

const assistedChatScreenSource = () => fs.readFileSync(assistedChatScreenPath, 'utf8');
const locationSectionSource = () => fs.readFileSync(locationSectionPath, 'utf8');

describe('Assisted Chat header video production readiness', () => {
  it('keeps the bundled MP4 referenced by static asset import', () => {
    const source = assistedChatScreenSource();
    const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));

    expect(fs.existsSync(videoAssetPath)).toBe(true);
    expect(source).toContain("import assistedChatHeaderVideoSource from '../../assets/video/assisted-chat-header.mp4'");
    expect(source).toContain('Asset.fromModule(assistedChatHeaderVideoSource)');
    expect(appConfig.expo.assetBundlePatterns).toBeUndefined();
  });

  it('rejects development server video URIs for production native playback', () => {
    expect(validateHeaderVideoUri('file:///var/mobile/Containers/Data/Application/app/header.mp4', true)).toEqual({ ok: true });
    expect(validateHeaderVideoUri('http://localhost:8081/assets/header.mp4', true)).toMatchObject({
      ok: false,
      reason: 'development-server-uri',
    });
    expect(validateHeaderVideoUri('http://192.168.1.161:8081/assets/header.mp4', true)).toMatchObject({
      ok: false,
      reason: 'development-server-uri',
    });
    expect(validateHeaderVideoUri('https://cdn.example.com/header.mp4', true)).toMatchObject({
      ok: false,
      reason: 'non-local-production-uri',
    });
  });

  it('uses local read access for file URIs without exposing the exact file in base access', () => {
    expect(getHeaderVideoReadAccessUri('file:///var/mobile/Containers/Data/Application/app/header.mp4')).toBe(
      'file:///var/mobile/Containers/Data/Application/app/',
    );
    expect(getHeaderVideoReadAccessUri('https://example.com/header.mp4')).toBe('https://example.com/header.mp4');
  });

  it('escapes the video URI and includes the iOS inline autoplay settings', () => {
    const html = buildHeaderVideoHtml('file:///tmp/header"bad.mp4');

    expect(html).toContain('autoplay');
    expect(html).toContain('muted');
    expect(html).toContain('playsinline');
    expect(html).toContain('webkit-playsinline');
    expect(html).toContain('loop');
    expect(html).toContain('preload="auto"');
    expect(html).toContain('JSON.stringify({ type: type');
    expect(html).toContain('file:///tmp/header\\"bad.mp4');
  });

  it('accepts only strict allow-listed WebView messages', () => {
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'ready' }))).toEqual({ type: 'ready' });
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'playing' }))).toEqual({ type: 'playing' });
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'paused' }))).toEqual({ type: 'paused' });
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'ended' }))).toEqual({ type: 'ended' });
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'error', reason: 'media-error' }))).toEqual({
      type: 'error',
      reason: 'media-error',
    });
    expect(parseHeaderVideoWebViewMessage('playing')).toBeNull();
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ type: 'eval-me' }))).toBeNull();
    expect(parseHeaderVideoWebViewMessage(JSON.stringify({ event: 'playing' }))).toBeNull();
  });

  it('keeps the fallback before playback and removes it only after playing', () => {
    expect(shouldShowHeaderVideoFallback({ videoStarted: false, videoFailed: false, videoUri: 'file:///header.mp4' })).toBe(true);
    expect(shouldShowHeaderVideoFallback({ videoStarted: true, videoFailed: false, videoUri: 'file:///header.mp4' })).toBe(false);
    expect(shouldShowHeaderVideoFallback({ videoStarted: true, videoFailed: true, videoUri: 'file:///header.mp4' })).toBe(true);
    expect(shouldShowHeaderVideoFallback({ videoStarted: false, videoFailed: false, videoUri: null })).toBe(true);
  });

  it('keeps native launch on a safe fallback and cleans up web startup timers', () => {
    const source = assistedChatScreenSource();

    expect(HEADER_VIDEO_STARTUP_TIMEOUT_MS).toBeGreaterThanOrEqual(3000);
    expect(source).toContain("if (Platform.OS !== 'web')");
    expect(source).toContain('<HeaderVideoFallback />');
    expect(source).not.toContain("from 'react-native-webview'");
    expect(source).toContain('setTimeout(() =>');
    expect(source).toContain('clearTimeout(startupTimer)');
  });

  it('keeps web playback lifecycle browser-only without trusting arbitrary native messages', () => {
    const source = assistedChatScreenSource();

    expect(source).toContain("window.addEventListener('focus', onFocus)");
    expect(source).toContain("window.addEventListener('blur', onBlur)");
    expect(source).toContain("window.removeEventListener('focus', onFocus)");
    expect(source).toContain("window.removeEventListener('blur', onBlur)");
    expect(source).not.toContain('parseHeaderVideoWebViewMessage(event.nativeEvent.data)');
    expect(source).not.toContain("event.nativeEvent.data === 'playing'");
    expect(source).not.toContain("event.nativeEvent.data === 'error'");
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
