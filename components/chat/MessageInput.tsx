'use client';

import { useState, useRef } from 'react';
import { Box, HStack, Input, Spinner, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Props {
  onSend: (text: string) => void;
  onSendImage: (file: File) => void;
  disabled: boolean;
  isSending: boolean;
  placeholder?: string;
}

export function MessageInput({ onSend, onSendImage, disabled, isSending, placeholder }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onSendImage(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Box borderTopWidth="1px" borderColor={c.border} p={2} bg={c.surface}>
      <HStack gap={2}>
        {/* Image upload button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || isSending}
          aria-label="Attach image"
          style={{
            background: 'transparent',
            border: `1px solid ${c.border}`,
            borderRadius: 6,
            padding: '8px 10px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: c.muted,
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          📷
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Text input */}
        <Input
          flex="1"
          size="sm"
          bg={c.card}
          borderColor={c.border}
          color={c.text}
          _placeholder={{ color: c.muted }}
          _focus={{ borderColor: c.accent, boxShadow: `0 0 0 1px ${c.accent}` }}
          borderRadius="6px"
          height="38px"
          fontSize="13px"
          placeholder={placeholder ?? 'Type a message…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          disabled={disabled || isSending}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={disabled || isSending || !text.trim()}
          style={{
            background: c.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            cursor: disabled || isSending || !text.trim() ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            opacity: disabled || !text.trim() ? 0.5 : 1,
            flexShrink: 0,
            minWidth: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isSending ? <Spinner size="xs" color="white" /> : 'Send'}
        </button>
      </HStack>
    </Box>
  );
}
