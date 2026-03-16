'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Flex, Text, VStack, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

/* ────────── Web Speech API type shim ────────── */

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionClass {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionClass;
    webkitSpeechRecognition?: SpeechRecognitionClass;
  }
}

/* ────────── Types ────────── */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

interface ChatAction {
  type: string;
  items?: StockPreviewItem[];
  data?: Record<string, unknown>;
}

interface StockPreviewItem {
  productId: string;
  display: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  currentStock: number;
  quantitySold: number;
  newStock: number;
}

interface Settings {
  dailyAskEnabled: boolean;
  dailyAskTime: string | null;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  autoOpenEnabled: boolean;
}

type View = 'chat' | 'settings';

/* ────────── Component ────────── */

export function AdminChatbot() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    dailyAskEnabled: true,
    dailyAskTime: null,
    voiceInputEnabled: false,
    voiceOutputEnabled: false,
    autoOpenEnabled: true,
  });

  // Stock update confirmation state
  const [pendingItems, setPendingItems] = useState<StockPreviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Voice state
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const greetedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  /* ────────── Speech Recognition setup ────────── */

  useEffect(() => {
    const SR = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (SR) {
      setSpeechSupported(true);
      const recognition = new SR();
      recognition.lang = 'en-GB';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);
      recognitionRef.current = recognition;
    }
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setInput('');
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening]);

  /* ────────── Speech Synthesis helpers ────────── */

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    // Pick best en-GB voice
    const voices = window.speechSynthesis.getVoices();
    const scottish = voices.find((v) => v.lang === 'en-GB' && /scot/i.test(v.name));
    const enGB = voices.find((v) => v.lang === 'en-GB');
    utterance.voice = scottish || enGB || null;
    utterance.lang = 'en-GB';
    window.speechSynthesis.speak(utterance);
  }, []);

  /* ────────── Helpers ────────── */

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ────────── API wrappers ────────── */

  const sendMessage = useCallback(
    async (
      text: string,
      intent: string = 'chat',
      payload?: unknown,
    ): Promise<{ reply: string; actions: ChatAction[]; sessionId: string } | null> => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId, intent, payload }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        setSessionId(data.sessionId);
        return data;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/chat/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch { /* ignore */ }
  }, []);

  const updateSetting = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      try {
        await fetch('/api/admin/chat/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch { /* ignore */ }
    },
    [],
  );

  /* ────────── Initial greeting + settings fetch ────────── */

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const triggerGreeting = useCallback(async () => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    const data = await sendMessage('', 'greeting');
    if (data) {
      setMessages([
        { role: 'assistant', content: data.reply, timestamp: new Date().toISOString(), actions: data.actions },
      ]);
    }
  }, [sendMessage]);

  useEffect(() => {
    if (open && messages.length === 0 && !greetedRef.current) {
      triggerGreeting();
    }
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, messages.length, triggerGreeting]);

  // Fetch alert count using existing lightweight count endpoints (avoids chat session pollution)
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const [cbRes, msgRes] = await Promise.all([
          fetch('/api/admin/callbacks/count'),
          fetch('/api/admin/messages/count'),
        ]);
        let total = 0;
        if (cbRes.ok) { const d = await cbRes.json(); total += d.count ?? 0; }
        if (msgRes.ok) { const d = await msgRes.json(); total += d.count ?? 0; }
        setAlertCount(total);
      } catch { /* ignore */ }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 120000);
    return () => clearInterval(interval);
  }, []);

  /* ────────── User send ────────── */

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    // Detect if the message contains sale patterns for auto stock update intent
    const salePattern = /sold\s+\d|^\d+\s*(?:x\s*)?\d{3}\/\d{2}\/R\d{2}/i;
    const intent = salePattern.test(text) ? 'stock_update' : 'chat';

    const data = await sendMessage(text, intent);
    if (data) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
        actions: data.actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Auto-speak assistant reply if voice output enabled
      if (settings.voiceOutputEnabled && data.reply) {
        speak(data.reply);
      }

      // Handle stock update preview
      const preview = data.actions?.find((a: ChatAction) => a.type === 'stock_update_preview');
      if (preview?.items) {
        setPendingItems(preview.items);
        // Pre-select all if single product per size, otherwise none
        if (preview.items.length <= 3) {
          setSelectedIds(new Set(preview.items.map((i: StockPreviewItem) => i.productId)));
        } else {
          setSelectedIds(new Set());
        }
      }
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Something went wrong. Try again.", timestamp: new Date().toISOString() },
      ]);
    }
  }, [input, loading, sendMessage]);

  /* ────────── Stock confirm / cancel ────────── */

  const handleConfirmStock = useCallback(async () => {
    const selected = pendingItems.filter((i) => selectedIds.has(i.productId));
    if (selected.length === 0) return;

    setPendingItems([]);
    setSelectedIds(new Set());

    const payload = {
      items: selected.map((i) => ({
        productId: i.productId,
        newStock: i.newStock,
        quantitySold: i.quantitySold,
      })),
    };

    const data = await sendMessage('Confirming stock update', 'stock_update_confirm', payload);
    if (data) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() },
      ]);
    }
  }, [pendingItems, selectedIds, sendMessage]);

  const handleCancelStock = useCallback(() => {
    setPendingItems([]);
    setSelectedIds(new Set());
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: "Stock update cancelled.", timestamp: new Date().toISOString() },
    ]);
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  /* ────────── Quick actions ────────── */

  const quickActions = [
    { label: 'Check Stock', intent: 'stock_summary' },
    { label: 'Bookings', intent: 'booking_query' },
    { label: 'Alerts', intent: 'alerts' },
    { label: 'Help', intent: 'help' },
  ];

  const handleQuickAction = useCallback(
    async (label: string, intent: string) => {
      const text = label.toLowerCase();
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: label, timestamp: new Date().toISOString() },
      ]);
      const data = await sendMessage(text, intent);
      if (data) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply, timestamp: new Date().toISOString(), actions: data.actions },
        ]);
      }
    },
    [sendMessage],
  );

  /* ────────── Settings toggle helper ────────── */

  function SettingRow({ label, value, field }: { label: string; value: boolean; field: keyof Settings }) {
    return (
      <Flex align="center" justify="space-between" py={2} px={1}>
        <Text fontSize="13px" color={c.text}>{label}</Text>
        <Box
          as="button"
          w="40px"
          h="22px"
          borderRadius="full"
          bg={value ? c.accent : c.border}
          position="relative"
          cursor="pointer"
          transition="background 0.2s"
          flexShrink={0}
          onClick={() => updateSetting({ [field]: !value })}
        >
          <Box
            position="absolute"
            top="2px"
            left={value ? '20px' : '2px'}
            w="18px"
            h="18px"
            borderRadius="full"
            bg="white"
            transition="left 0.2s"
          />
        </Box>
      </Flex>
    );
  }

  /* ────────── Render ────────── */

  // Minimized launcher button
  if (!open) {
    return (
      <Box
        as="button"
        position="fixed"
        bottom="24px"
        right="24px"
        w="48px"
        h="48px"
        borderRadius="full"
        bg={c.accent}
        color="#09090B"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        zIndex={{ base: 150, md: 80 }}
        transition="transform 0.2s, box-shadow 0.2s"
        _hover={{ transform: 'scale(1.08)', boxShadow: `0 4px 20px ${c.accentGlow}` }}
        onClick={() => setOpen(true)}
        style={anim.scaleIn()}
        aria-label="Open admin chat"
      >
        {/* Chat icon - simple text glyph */}
        <Text fontSize="20px" fontWeight="700" lineHeight="1" mt="-1px">
          ?
        </Text>
        {/* Alert badge */}
        {alertCount > 0 && (
          <Box
            position="absolute"
            top="-2px"
            right="-2px"
            w="16px"
            h="16px"
            borderRadius="full"
            bg="#EF4444"
            border="2px solid"
            borderColor={c.bg}
          />
        )}
      </Box>
    );
  }

  // Expanded panel
  return (
    <Box
      position="fixed"
      bottom={{ base: 0, md: '24px' }}
      right={{ base: 0, md: '24px' }}
      w={{ base: '100%', md: '380px' }}
      h={{ base: '100dvh', md: '520px' }}
      bg={c.surface}
      borderRadius={{ base: 0, md: '12px' }}
      border={`1px solid ${c.border}`}
      display="flex"
      flexDirection="column"
      zIndex={{ base: 150, md: 80 }}
      overflow="hidden"
      style={anim.fadeUp('0.3s')}
    >
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        px={4}
        h="48px"
        borderBottom={`1px solid ${c.border}`}
        flexShrink={0}
        bg={c.card}
      >
        <Text fontSize="14px" fontWeight="600" color={c.text} letterSpacing="0.02em">
          Admin Assistant
        </Text>
        <Flex gap={1}>
          {/* Speaker toggle */}
          {settings.voiceOutputEnabled && (
            <Box
              as="button"
              px={2}
              py={1}
              borderRadius="md"
              bg="transparent"
              color={c.muted}
              fontSize="12px"
              fontWeight="600"
              cursor="pointer"
              _hover={{ color: c.accent }}
              transition="color 0.2s"
              onClick={() => window.speechSynthesis?.cancel()}
              title="Stop speaking"
            >
              STOP
            </Box>
          )}
          {/* Settings button */}
          <Box
            as="button"
            px={2}
            py={1}
            borderRadius="md"
            bg="transparent"
            color={view === 'settings' ? c.accent : c.muted}
            fontSize="12px"
            fontWeight="600"
            cursor="pointer"
            _hover={{ color: c.accent }}
            transition="color 0.2s"
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          >
            SETTINGS
          </Box>
          {/* Close button */}
          <Box
            as="button"
            px={2}
            py={1}
            borderRadius="md"
            bg="transparent"
            color={c.muted}
            fontSize="16px"
            fontWeight="600"
            cursor="pointer"
            _hover={{ color: c.text }}
            transition="color 0.2s"
            onClick={() => setOpen(false)}
          >
            ✕
          </Box>
        </Flex>
      </Flex>

      {view === 'settings' ? (
        /* ────────── Settings view ────────── */
        <Box flex={1} overflowY="auto" px={4} py={3}>
          <Text fontSize="12px" fontWeight="600" color={c.muted} letterSpacing="0.05em" textTransform="uppercase" mb={3}>
            Chat Preferences
          </Text>
          <VStack align="stretch" gap={0} divideY="1px" divideColor={c.border}>
            <SettingRow label="Daily sales question" value={settings.dailyAskEnabled} field="dailyAskEnabled" />
            <SettingRow label="Auto-open on login" value={settings.autoOpenEnabled} field="autoOpenEnabled" />
            <SettingRow label={speechSupported ? 'Voice input (mic)' : 'Voice input (not supported)'} value={settings.voiceInputEnabled} field="voiceInputEnabled" />
            <SettingRow label="Voice output (speaker)" value={settings.voiceOutputEnabled} field="voiceOutputEnabled" />
          </VStack>
        </Box>
      ) : (
        /* ────────── Chat view ────────── */
        <>
          {/* Messages */}
          <Box flex={1} overflowY="auto" px={3} py={3}>
            {messages.length === 0 && !loading && (
              <Text fontSize="13px" color={c.muted} textAlign="center" mt={8}>
                Loading...
              </Text>
            )}
            <VStack align="stretch" gap={2}>
              {messages.map((msg, i) => (
                <Flex
                  key={i}
                  justify={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                  style={anim.fadeUp('0.25s')}
                >
                  <Box
                    maxW="85%"
                    px={3}
                    py={2}
                    borderRadius="10px"
                    bg={msg.role === 'user' ? 'rgba(249, 115, 22, 0.15)' : c.card}
                    borderBottomRightRadius={msg.role === 'user' ? '2px' : '10px'}
                    borderBottomLeftRadius={msg.role === 'assistant' ? '2px' : '10px'}
                  >
                    <Text
                      fontSize="13px"
                      color={c.text}
                      whiteSpace="pre-wrap"
                      lineHeight="1.5"
                    >
                      {msg.content}
                    </Text>
                    {msg.role === 'assistant' && settings.voiceOutputEnabled && (
                      <Text
                        as="button"
                        fontSize="11px"
                        color={c.muted}
                        mt={1}
                        cursor="pointer"
                        bg="transparent"
                        border="none"
                        p={0}
                        _hover={{ color: c.accent }}
                        transition="color 0.15s"
                        onClick={() => speak(msg.content)}
                      >
                        Read aloud
                      </Text>
                    )}
                  </Box>
                </Flex>
              ))}

              {/* Stock update preview */}
              {pendingItems.length > 0 && (
                <Box
                  bg={c.card}
                  borderRadius="10px"
                  px={3}
                  py={3}
                  style={anim.fadeUp('0.3s')}
                >
                  <Text fontSize="12px" fontWeight="600" color={c.muted} mb={2} textTransform="uppercase" letterSpacing="0.05em">
                    Select products to update
                  </Text>
                  <VStack align="stretch" gap={1}>
                    {pendingItems.map((item) => (
                      <Flex
                        key={item.productId}
                        as="button"
                        align="center"
                        gap={2}
                        px={2}
                        py={2}
                        borderRadius="md"
                        bg={selectedIds.has(item.productId) ? 'rgba(249, 115, 22, 0.1)' : 'transparent'}
                        border={`1px solid ${selectedIds.has(item.productId) ? c.accent : c.border}`}
                        cursor="pointer"
                        transition="all 0.15s"
                        _hover={{ borderColor: c.accent }}
                        onClick={() => toggleProduct(item.productId)}
                        textAlign="left"
                        w="100%"
                      >
                        {/* Checkbox indicator */}
                        <Box
                          w="16px"
                          h="16px"
                          borderRadius="3px"
                          border={`2px solid ${selectedIds.has(item.productId) ? c.accent : c.border}`}
                          bg={selectedIds.has(item.productId) ? c.accent : 'transparent'}
                          flexShrink={0}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          transition="all 0.15s"
                        >
                          {selectedIds.has(item.productId) && (
                            <Text fontSize="10px" color="#09090B" fontWeight="700" lineHeight="1">
                              ✓
                            </Text>
                          )}
                        </Box>
                        <Box flex={1}>
                          <Text fontSize="12px" fontWeight="500" color={c.text}>
                            {item.brand} {item.pattern}
                          </Text>
                          <Text fontSize="11px" color={c.muted}>
                            {item.sizeDisplay} — {item.currentStock} → {item.newStock} ({-item.quantitySold})
                          </Text>
                        </Box>
                      </Flex>
                    ))}
                  </VStack>

                  <Flex gap={2} mt={3}>
                    <Box
                      as="button"
                      flex={1}
                      py={2}
                      bg={selectedIds.size > 0 ? c.accent : c.border}
                      color={selectedIds.size > 0 ? '#09090B' : c.muted}
                      borderRadius="md"
                      fontSize="13px"
                      fontWeight="600"
                      cursor={selectedIds.size > 0 ? 'pointer' : 'not-allowed'}
                      transition="all 0.2s"
                      _hover={selectedIds.size > 0 ? { bg: c.accentHover } : {}}
                      onClick={handleConfirmStock}
                      aria-disabled={selectedIds.size === 0}
                      pointerEvents={selectedIds.size === 0 ? 'none' : 'auto'}
                    >
                      Confirm ({selectedIds.size})
                    </Box>
                    <Box
                      as="button"
                      px={4}
                      py={2}
                      bg="transparent"
                      border={`1px solid ${c.border}`}
                      color={c.muted}
                      borderRadius="md"
                      fontSize="13px"
                      fontWeight="600"
                      cursor="pointer"
                      _hover={{ borderColor: c.text, color: c.text }}
                      transition="all 0.2s"
                      onClick={handleCancelStock}
                    >
                      Cancel
                    </Box>
                  </Flex>
                </Box>
              )}

              {loading && (
                <Flex justify="flex-start" py={1}>
                  <Box px={3} py={2} borderRadius="10px" bg={c.card}>
                    <Spinner size="sm" color={c.accent} />
                  </Box>
                </Flex>
              )}
              <div ref={messagesEndRef} />
            </VStack>
          </Box>

          {/* Quick actions */}
          {messages.length <= 2 && pendingItems.length === 0 && (
            <Flex gap={1} px={3} pb={2} flexWrap="wrap">
              {quickActions.map((qa) => (
                <Box
                  key={qa.label}
                  as="button"
                  px={3}
                  py={1}
                  bg="transparent"
                  border={`1px solid ${c.border}`}
                  borderRadius="full"
                  color={c.muted}
                  fontSize="12px"
                  fontWeight="500"
                  cursor="pointer"
                  transition="all 0.15s"
                  _hover={{ borderColor: c.accent, color: c.accent }}
                  onClick={() => handleQuickAction(qa.label, qa.intent)}
                  aria-disabled={loading}
                  pointerEvents={loading ? 'none' : 'auto'}
                >
                  {qa.label}
                </Box>
              ))}
            </Flex>
          )}

          {/* Input bar */}
          <Flex
            px={3}
            py={2}
            borderTop={`1px solid ${c.border}`}
            gap={2}
            flexShrink={0}
            bg={c.surface}
          >
            {/* Mic button */}
            {speechSupported && settings.voiceInputEnabled && (
              <Box
                as="button"
                h="40px"
                w="40px"
                flexShrink={0}
                bg={listening ? '#EF4444' : 'transparent'}
                border={`1px solid ${listening ? '#EF4444' : c.border}`}
                borderRadius="8px"
                color={listening ? 'white' : c.muted}
                fontSize="14px"
                fontWeight="700"
                cursor="pointer"
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="all 0.2s"
                _hover={{ borderColor: c.accent, color: listening ? 'white' : c.accent }}
                onClick={toggleListening}
                title={listening ? 'Stop recording' : 'Start voice input'}
              >
                {listening ? '■' : '🎤'}
              </Box>
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder={listening ? 'Listening...' : 'Type a message...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              style={{
                flex: 1,
                height: '40px',
                fontSize: '13px',
                borderRadius: '8px',
                padding: '0 12px',
                background: c.input.bg,
                border: `1px solid ${listening ? '#EF4444' : c.input.border}`,
                color: c.input.text,
                outline: 'none',
                opacity: loading ? 0.5 : 1,
              }}
            />
            <Box
              as="button"
              h="40px"
              px={4}
              bg={input.trim() ? c.accent : c.border}
              color={input.trim() ? '#09090B' : c.muted}
              borderRadius="8px"
              fontSize="13px"
              fontWeight="600"
              cursor={input.trim() && !loading ? 'pointer' : 'default'}
              transition="all 0.2s"
              _hover={input.trim() ? { bg: c.accentHover } : {}}
              onClick={handleSend}
              aria-disabled={loading || !input.trim()}
              pointerEvents={loading || !input.trim() ? 'none' : 'auto'}
              display="flex"
              alignItems="center"
            >
              Send
            </Box>
          </Flex>
        </>
      )}
    </Box>
  );
}
