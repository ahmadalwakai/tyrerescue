import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function styleBlock(fileSource: string, styleName: string): string {
  const match = fileSource.match(new RegExp(`${styleName}: \\{[\\s\\S]*?\\n  \\},`));
  return match?.[0] ?? '';
}

describe('Assisted Chat premium design system', () => {
  it('keeps the shared palette expressive without adding UI libraries', () => {
    const theme = source('assisted-chat-app/src/components/theme.ts');
    const packageJson = JSON.parse(source('assisted-chat-app/package.json')) as {
      dependencies?: Record<string, string>;
    };

    for (const token of ['appBackground', 'elevatedSurface', 'glassSurface', 'heroSurface', 'orangeGlow', 'blueGlow', 'greenGlow', 'dangerGlow']) {
      expect(theme).toContain(`${token}:`);
    }
    expect(theme).toContain('export const designTokens');
    expect(theme).toContain('radius: {');
    expect(packageJson.dependencies).not.toHaveProperty('framer-motion');
    expect(packageJson.dependencies).not.toHaveProperty('@chakra-ui/react');
  });

  it('exposes reusable Assisted Chat UI primitives for screens and modals', () => {
    const ui = source('assisted-chat-app/src/components/ui.tsx');

    for (const exportName of ['GlassCard', 'SectionHeader', 'MetricCard', 'Input']) {
      expect(ui).toContain(`export function ${exportName}`);
    }
    expect(ui).toContain('colors.glass');
    expect(ui).not.toContain('cardGlow');
    expect(ui).not.toContain('glassGlow');
  });

  it('keeps mobile login and header layout flexible at 320px', () => {
    const login = source('assisted-chat-app/src/components/LoginScreen.tsx');
    const screen = source('assisted-chat-app/src/components/AssistedChatScreen.tsx');
    const narrowShell = styleBlock(login, 'shellNarrow');

    expect(narrowShell).toContain("width: '100%'");
    expect(narrowShell).toContain('maxWidth: 430');
    expect(narrowShell).not.toContain('minWidth:');
    expect(screen).toContain('ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH');
    expect(screen).toContain('function HeroPanel');
    expect(screen).toContain('function PrimaryActionDeck');
    expect(screen).toContain('function UrgentMonitorPanel');
    expect(screen).toContain('function TrustStrip');
    expect(screen).not.toContain('headerCoolBloom');
    expect(screen).not.toContain('headerWarmBloom');
    expect(screen).not.toContain('headerContactRow');
  });

  it('does not reintroduce non-zero letter spacing in Assisted Chat components', () => {
    const componentPaths = [
      'assisted-chat-app/src/components/AssistedChatScreen.tsx',
      'assisted-chat-app/src/components/LoginScreen.tsx',
      'assisted-chat-app/src/components/ui.tsx',
      'assisted-chat-app/src/components/ui/ActionButton.tsx',
      'assisted-chat-app/src/components/ui/AlertActionButton.tsx',
      'assisted-chat-app/src/components/workflow/StepCard.tsx',
      'assisted-chat-app/src/components/workflow/OperatorStepProgress.tsx',
      'assisted-chat-app/src/components/PriceSummary.tsx',
      'assisted-chat-app/src/components/quote/CompactQuoteCard.tsx',
      'assisted-chat-app/src/components/tracking/BookingTrackingCard.tsx',
    ];

    for (const relativePath of componentPaths) {
      const matches = source(relativePath).matchAll(/letterSpacing:\s*([^,\n}]+)/g);
      for (const match of matches) {
        expect(match[1].trim(), relativePath).toBe('0');
      }
    }
  });
});
