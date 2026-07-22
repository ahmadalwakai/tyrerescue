import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(root, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');
const assistedChatIndexPath = path.join(root, 'assisted-chat-app/app/index.tsx');
const assistedChatAppJsonPath = path.join(root, 'assisted-chat-app/app.json');
const assistedChatPackageJsonPath = path.join(root, 'assisted-chat-app/package.json');

const assistedChatScreenSource = () => fs.readFileSync(assistedChatScreenPath, 'utf8');
const assistedChatIndexSource = () => fs.readFileSync(assistedChatIndexPath, 'utf8');

describe('Assisted Chat native launch safety', () => {
  it('does not import the heavy assisted chat screen at route module load time', () => {
    const source = assistedChatIndexSource();
    const importBlock = source.slice(0, source.indexOf('export default function Index'));

    expect(importBlock).not.toContain("AssistedChatScreen } from '@/components/AssistedChatScreen'");
    expect(source).toContain("require('@/components/AssistedChatScreen')");
  });

  it('does not load media or document native modules on initial screen import', () => {
    const source = assistedChatScreenSource();
    const importBlock = source.slice(0, source.indexOf('const GBP'));

    expect(importBlock).not.toContain("from 'expo-audio'");
    expect(importBlock).not.toContain("from './LocationSection'");
    expect(importBlock).not.toContain("from './alerts/UrgentBookingPopup'");
    expect(importBlock).not.toContain("from './AdminStockModal'");
    expect(importBlock).not.toContain("from './ActiveJobsModal'");
    expect(importBlock).not.toContain("from './TrackingModal'");
    expect(importBlock).not.toContain("from './ChatHubModal'");
    expect(importBlock).not.toContain("from './DriverChatModal'");
    expect(importBlock).not.toMatch(/import\s+\{\s*VirtualLandlineModal[\s\S]*from '\.\/VirtualLandlineModal'/);
    expect(importBlock).toContain("import type { VirtualLandlineDraftPrefill } from './VirtualLandlineModal'");
  });

  it('defers native-heavy modules until the admin opens or reaches them', () => {
    const source = assistedChatScreenSource();

    expect(source).toContain('function DeferredLocationSection');
    expect(source).toContain("require('./LocationSection')");
    expect(source).toContain('function DeferredUrgentBookingPopup');
    expect(source).toContain("require('./alerts/UrgentBookingPopup')");
    expect(source).toContain('function DeferredAdminStockModal');
    expect(source).toContain("require('./AdminStockModal')");
    expect(source).toContain('function DeferredActiveJobsModal');
    expect(source).toContain("require('./ActiveJobsModal')");
    expect(source).toContain('function DeferredTrackingModal');
    expect(source).toContain("require('./TrackingModal')");
    expect(source).toContain('function DeferredChatHubModal');
    expect(source).toContain("require('./ChatHubModal')");
    expect(source).toContain('function DeferredDriverChatModal');
    expect(source).toContain("require('./DriverChatModal')");
    expect(source).toContain('function DeferredVirtualLandlineModal');
    expect(source).toContain("require('./VirtualLandlineModal')");
  });

  it('does not link expo-audio into the assisted chat binary', () => {
    const appJson = fs.readFileSync(assistedChatAppJsonPath, 'utf8');
    const packageJson = fs.readFileSync(assistedChatPackageJsonPath, 'utf8');
    const screen = assistedChatScreenSource();

    expect(appJson).not.toContain('expo-audio');
    expect(packageJson).not.toContain('expo-audio');
    expect(screen).not.toContain('expo-audio');
  });
});
