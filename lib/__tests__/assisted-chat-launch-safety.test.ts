import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(root, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');

const assistedChatScreenSource = () => fs.readFileSync(assistedChatScreenPath, 'utf8');

describe('Assisted Chat native launch safety', () => {
  it('does not load media or document native modules on initial screen import', () => {
    const source = assistedChatScreenSource();
    const importBlock = source.slice(0, source.indexOf('const GBP'));

    expect(importBlock).not.toContain("from 'expo-audio'");
    expect(importBlock).not.toContain("from './ChatHubModal'");
    expect(importBlock).not.toContain("from './DriverChatModal'");
    expect(importBlock).not.toMatch(/import\s+\{\s*VirtualLandlineModal[\s\S]*from '\.\/VirtualLandlineModal'/);
    expect(importBlock).toContain("import type { VirtualLandlineDraftPrefill } from './VirtualLandlineModal'");
  });

  it('defers native-heavy chat and CSV modals until the admin opens them', () => {
    const source = assistedChatScreenSource();

    expect(source).toContain('function DeferredChatHubModal');
    expect(source).toContain("require('./ChatHubModal')");
    expect(source).toContain('function DeferredDriverChatModal');
    expect(source).toContain("require('./DriverChatModal')");
    expect(source).toContain('function DeferredVirtualLandlineModal');
    expect(source).toContain("require('./VirtualLandlineModal')");
  });
});
