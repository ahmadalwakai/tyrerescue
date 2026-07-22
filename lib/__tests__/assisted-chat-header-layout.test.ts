import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH,
  ASSISTED_CHAT_HEADER_TITLE,
  getAssistedChatHeaderLayoutSnapshot,
  type AssistedChatHeaderWorkflowStage,
} from '../../assisted-chat-app/src/lib/header-layout';

const repoRoot = path.resolve(__dirname, '..', '..');
const headerPath = 'assisted-chat-app/src/components/AssistedChatScreen.tsx';
const headerSource = () => readFileSync(path.join(repoRoot, headerPath), 'utf8');

const portraitWidths = [320, 360, 375, 390, 414];
const landscapeWidths = [568, 640, 667, 736, 896];
const stages: AssistedChatHeaderWorkflowStage[] = ['Draft', 'Quote', 'Payment', 'Dispatch'];

function styleBlock(source: string, styleName: string): string {
  const match = source.match(new RegExp(`${styleName}: \\{[\\s\\S]*?\\n  \\},`));
  return match?.[0] ?? '';
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return '';
  return source.slice(startIndex, endIndex);
}

describe('Assisted Chat mobile header layout', () => {
  it('snapshots the protected narrow-width header contract', () => {
    const snapshots = portraitWidths.map((width) =>
      getAssistedChatHeaderLayoutSnapshot(width, 'portrait', 'Dispatch'),
    );

    expect(snapshots).toMatchInlineSnapshot(`
      [
        {
          "actions": {
            "availableWidth": 288,
            "minButtonHeight": 42,
            "sharesTextLine": false,
            "wraps": true,
          },
          "contentWidth": 288,
          "customerName": {
            "ellipsizeMode": "tail",
            "numberOfLines": 1,
          },
          "customerPhone": {
            "avoidsButtonOverlap": true,
            "numberOfLines": 1,
          },
          "infoColumnFlexShrink": 0,
          "infoColumnMinWidth": 184,
          "orientation": "portrait",
          "stage": "Dispatch",
          "title": {
            "numberOfLines": 1,
            "text": "Assisted Chat",
            "wrapsCharacterByCharacter": false,
          },
          "viewportWidth": 320,
        },
        {
          "actions": {
            "availableWidth": 328,
            "minButtonHeight": 42,
            "sharesTextLine": false,
            "wraps": true,
          },
          "contentWidth": 328,
          "customerName": {
            "ellipsizeMode": "tail",
            "numberOfLines": 1,
          },
          "customerPhone": {
            "avoidsButtonOverlap": true,
            "numberOfLines": 1,
          },
          "infoColumnFlexShrink": 0,
          "infoColumnMinWidth": 184,
          "orientation": "portrait",
          "stage": "Dispatch",
          "title": {
            "numberOfLines": 1,
            "text": "Assisted Chat",
            "wrapsCharacterByCharacter": false,
          },
          "viewportWidth": 360,
        },
        {
          "actions": {
            "availableWidth": 343,
            "minButtonHeight": 42,
            "sharesTextLine": false,
            "wraps": true,
          },
          "contentWidth": 343,
          "customerName": {
            "ellipsizeMode": "tail",
            "numberOfLines": 1,
          },
          "customerPhone": {
            "avoidsButtonOverlap": true,
            "numberOfLines": 1,
          },
          "infoColumnFlexShrink": 0,
          "infoColumnMinWidth": 184,
          "orientation": "portrait",
          "stage": "Dispatch",
          "title": {
            "numberOfLines": 1,
            "text": "Assisted Chat",
            "wrapsCharacterByCharacter": false,
          },
          "viewportWidth": 375,
        },
        {
          "actions": {
            "availableWidth": 358,
            "minButtonHeight": 42,
            "sharesTextLine": false,
            "wraps": true,
          },
          "contentWidth": 358,
          "customerName": {
            "ellipsizeMode": "tail",
            "numberOfLines": 1,
          },
          "customerPhone": {
            "avoidsButtonOverlap": true,
            "numberOfLines": 1,
          },
          "infoColumnFlexShrink": 0,
          "infoColumnMinWidth": 184,
          "orientation": "portrait",
          "stage": "Dispatch",
          "title": {
            "numberOfLines": 1,
            "text": "Assisted Chat",
            "wrapsCharacterByCharacter": false,
          },
          "viewportWidth": 390,
        },
        {
          "actions": {
            "availableWidth": 382,
            "minButtonHeight": 42,
            "sharesTextLine": false,
            "wraps": true,
          },
          "contentWidth": 382,
          "customerName": {
            "ellipsizeMode": "tail",
            "numberOfLines": 1,
          },
          "customerPhone": {
            "avoidsButtonOverlap": true,
            "numberOfLines": 1,
          },
          "infoColumnFlexShrink": 0,
          "infoColumnMinWidth": 184,
          "orientation": "portrait",
          "stage": "Dispatch",
          "title": {
            "numberOfLines": 1,
            "text": "Assisted Chat",
            "wrapsCharacterByCharacter": false,
          },
          "viewportWidth": 414,
        },
      ]
    `);
  });

  it('keeps the same header contract for draft, quote, payment, and dispatch stages', () => {
    const snapshots = stages.flatMap((stage) =>
      [...portraitWidths, ...landscapeWidths].map((width) =>
        getAssistedChatHeaderLayoutSnapshot(
          width,
          width >= 568 ? 'landscape' : 'portrait',
          stage,
        ),
      ),
    );

    for (const snapshot of snapshots) {
      expect(snapshot.infoColumnMinWidth).toBe(ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH);
      expect(snapshot.infoColumnFlexShrink).toBe(0);
      expect(snapshot.title).toMatchObject({
        text: ASSISTED_CHAT_HEADER_TITLE,
        numberOfLines: 1,
        wrapsCharacterByCharacter: false,
      });
      expect(snapshot.customerName).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' });
      expect(snapshot.customerPhone).toMatchObject({ numberOfLines: 1, avoidsButtonOverlap: true });
      expect(snapshot.actions.wraps).toBe(true);
      expect(snapshot.actions.availableWidth).toBeGreaterThanOrEqual(snapshot.infoColumnMinWidth);
      expect(snapshot.actions.availableWidth).toBeLessThanOrEqual(snapshot.contentWidth);
    }
  });

  it('wires the component to single-line customer information and flexible actions', () => {
    const source = headerSource();

    expect(source).toMatch(
      /<Text\s+style=\{styles\.headerTitle\}\s+numberOfLines=\{1\}\s+testID="assisted-chat-header-title">Assisted Chat<\/Text>/,
    );
    expect(source).toMatch(
      /<Text\s+style=\{styles\.headerCustomer\}\s+numberOfLines=\{1\}\s+ellipsizeMode="tail"\s+testID="assisted-chat-header-customer">/,
    );
    expect(source).toMatch(
      /<Text\s+style=\{styles\.headerPhone\}\s+numberOfLines=\{1\}\s+ellipsizeMode="tail"\s+testID="assisted-chat-header-phone">/,
    );
    expect(source).toContain('testID="assisted-chat-header-actions"');
    expect(source).toContain('testID="assisted-chat-header-more-button"');
    expect(source).toContain('testID="assisted-chat-header-call-button"');
    expect(source).toContain('testID="assisted-chat-header-invoice-button"');
    expect(source).toContain('testID="assisted-chat-header-whatsapp-button"');
    expect(source).toContain('testID="assisted-chat-header-clear-draft-button"');
    expect(source).toContain('styles.actionGlyphFrame');
    expect(source).toContain('styles.actionGlyphRing');
    expect(source).toContain('styles.actionGlyphShine');
    const primaryDeck = sourceBetween(source, 'function PrimaryActionDeck', 'function PrimaryActionCard');
    expect(primaryDeck).not.toContain('Direct call');
    expect(primaryDeck).not.toContain('Open chat');
    expect(primaryDeck).not.toContain('Customer copy');
    expect(primaryDeck).not.toContain('Start over');
    expect(source).toContain('styles.headerActionsRow');
    expect(source).toContain('flexShrink: 0');
    expect(styleBlock(source, 'headerTopRow')).toContain("flexWrap: 'nowrap'");
    expect(styleBlock(source, 'headerIdentityRow')).toContain('paddingRight: 112');
    const utilityBlock = styleBlock(source, 'headerUtilityRow');
    expect(utilityBlock).toContain("position: 'absolute'");
    expect(utilityBlock).toContain('top: 0');
    expect(utilityBlock).toContain('right: 0');
    expect(source).not.toMatch(/headerTextBlock:\s*\{\s*flex:\s*1,\s*minWidth:\s*0\s*\}/);
    expect(source).not.toMatch(/headerContactRow/);
    for (const styleName of ['headerInvoiceButton', 'headerWhatsAppButton', 'headerClearDraftButton']) {
      const block = styleBlock(source, styleName);
      expect(block).toContain('flexGrow: 1');
      expect(block).toContain('flexShrink: 1');
      expect(block).not.toContain('maxWidth:');
    }
  });
});
