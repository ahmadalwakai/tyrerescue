export const ASSISTED_CHAT_HEADER_HORIZONTAL_PADDING = 16;
export const ASSISTED_CHAT_HEADER_TOP_ROW_GAP = 12;
export const ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH = 184;
export const ASSISTED_CHAT_HEADER_ACTIONS_INLINE_BASIS = 280;
export const ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT = 42;
export const ASSISTED_CHAT_HEADER_TITLE = 'Assisted Chat';

export type AssistedChatHeaderOrientation = 'portrait' | 'landscape';
export type AssistedChatHeaderWorkflowStage = 'Draft' | 'Quote' | 'Payment' | 'Dispatch';

export interface AssistedChatHeaderLayoutSnapshot {
  viewportWidth: number;
  orientation: AssistedChatHeaderOrientation;
  stage: AssistedChatHeaderWorkflowStage;
  contentWidth: number;
  infoColumnMinWidth: number;
  infoColumnFlexShrink: 0;
  title: {
    text: typeof ASSISTED_CHAT_HEADER_TITLE;
    numberOfLines: 1;
    wrapsCharacterByCharacter: false;
  };
  customerName: {
    numberOfLines: 1;
    ellipsizeMode: 'tail';
  };
  customerPhone: {
    numberOfLines: 1;
    avoidsButtonOverlap: true;
  };
  actions: {
    wraps: true;
    sharesTextLine: boolean;
    availableWidth: number;
    minButtonHeight: number;
  };
}

export function getAssistedChatHeaderLayoutSnapshot(
  viewportWidth: number,
  orientation: AssistedChatHeaderOrientation,
  stage: AssistedChatHeaderWorkflowStage,
): AssistedChatHeaderLayoutSnapshot {
  const contentWidth = Math.max(0, viewportWidth - ASSISTED_CHAT_HEADER_HORIZONTAL_PADDING * 2);
  const canShareTextLine =
    contentWidth >=
    ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH +
      ASSISTED_CHAT_HEADER_TOP_ROW_GAP +
      ASSISTED_CHAT_HEADER_ACTIONS_INLINE_BASIS;

  return {
    viewportWidth,
    orientation,
    stage,
    contentWidth,
    infoColumnMinWidth: ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH,
    infoColumnFlexShrink: 0,
    title: {
      text: ASSISTED_CHAT_HEADER_TITLE,
      numberOfLines: 1,
      wrapsCharacterByCharacter: false,
    },
    customerName: {
      numberOfLines: 1,
      ellipsizeMode: 'tail',
    },
    customerPhone: {
      numberOfLines: 1,
      avoidsButtonOverlap: true,
    },
    actions: {
      wraps: true,
      sharesTextLine: canShareTextLine,
      availableWidth: canShareTextLine
        ? Math.max(
            0,
            contentWidth - ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH - ASSISTED_CHAT_HEADER_TOP_ROW_GAP,
          )
        : contentWidth,
      minButtonHeight: ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
    },
  };
}
