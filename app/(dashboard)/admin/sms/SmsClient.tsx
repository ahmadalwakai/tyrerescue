'use client';

import { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Textarea,
  Input,
  Button,
  Badge,
  Flex,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const TEMPLATES = [
  { label: 'Driver Assigned', body: 'Hi, your Tyre Rescue driver has been assigned and will be with you shortly. You can track them live from your booking confirmation email.' },
  { label: 'On the Way', body: 'Good news — your Tyre Rescue driver is now on the way to your location. Please ensure the vehicle is accessible.' },
  { label: 'Share Location', body: 'Hi, could you please share your exact location with our driver? It helps us find you faster. Thank you!' },
  { label: 'Delayed', body: 'We apologise for the delay. Our driver is running slightly behind but will be with you as soon as possible. Thank you for your patience.' },
  { label: 'Job Completed', body: 'Your Tyre Rescue job is now complete. Thank you for choosing us! If you have any questions, call us on 0141 266 0690.' },
  { label: 'Call Back', body: 'Hi, we tried to reach you. Please call us back on 0141 266 0690 at your earliest convenience. — Tyre Rescue' },
];

interface SentLog {
  to: string;
  time: string;
  ok: boolean;
  error?: string;
}

export function SmsClient() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [sentLog, setSentLog] = useState<SentLog[]>([]);

  const handleSend = async () => {
    if (!phone.trim() || !message.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ ok: true, text: `SMS sent to ${phone}` });
        setSentLog((prev) => [{ to: phone, time: new Date().toLocaleTimeString(), ok: true }, ...prev.slice(0, 19)]);
        setMessage('');
      } else {
        const err = data.error || 'Failed to send';
        setFeedback({ ok: false, text: err });
        setSentLog((prev) => [{ to: phone, time: new Date().toLocaleTimeString(), ok: false, error: err }, ...prev.slice(0, 19)]);
      }
    } catch {
      setFeedback({ ok: false, text: 'Network error' });
    }
    setSending(false);
  };

  return (
    <Box maxW="800px">
      <Heading size="lg" mb={6} color={c.text} style={anim.fadeUp()}>
        SMS Messages
      </Heading>

      {/* Send form */}
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} mb={6} style={anim.fadeUp('0.4s', '0.05s')}>
        <VStack gap={4} align="stretch">
          <Box>
            <Text fontSize="sm" color={c.muted} mb={1}>Phone Number</Text>
            <Input
              {...inputProps}
              size="sm"
              height="40px"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07xxx xxxxxx or +447xxxxxxxxx"
            />
          </Box>

          <Box>
            <Text fontSize="sm" color={c.muted} mb={1}>Message</Text>
            <Textarea
              {...textareaProps}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
              maxLength={1600}
            />
            <Text fontSize="xs" color={c.muted} mt={1} textAlign="right">
              {message.length}/1600
            </Text>
          </Box>

          {/* Quick templates */}
          <Box>
            <Text fontSize="sm" color={c.muted} mb={2}>Quick Templates</Text>
            <Flex gap={2} flexWrap="wrap">
              {TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  size="xs"
                  variant="outline"
                  borderColor={c.border}
                  color={c.text}
                  _hover={{ borderColor: c.accent, color: c.accent }}
                  onClick={() => setMessage(t.body)}
                >
                  {t.label}
                </Button>
              ))}
            </Flex>
          </Box>

          {/* Feedback */}
          {feedback && (
            <Badge
              colorPalette={feedback.ok ? 'green' : 'red'}
              p={2}
              borderRadius="md"
              fontSize="sm"
            >
              {feedback.text}
            </Badge>
          )}

          <Button
            bg={c.accent}
            color="#09090B"
            _hover={{ bg: c.accentHover }}
            onClick={handleSend}
            disabled={sending || !phone.trim() || !message.trim()}
            minH="44px"
          >
            {sending ? 'Sending…' : '📱 Send SMS'}
          </Button>
        </VStack>
      </Box>

      {/* Sent log */}
      {sentLog.length > 0 && (
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.1s')}>
          <Heading size="sm" mb={4} color={c.text}>Recent Sends</Heading>
          <VStack gap={2} align="stretch">
            {sentLog.map((entry, i) => (
              <HStack key={i} justify="space-between" py={1} borderBottom="1px solid" borderColor={c.border}>
                <HStack gap={2}>
                  <Badge colorPalette={entry.ok ? 'green' : 'red'} size="sm">
                    {entry.ok ? '✓' : '✗'}
                  </Badge>
                  <Text fontSize="sm" color={c.text}>{entry.to}</Text>
                </HStack>
                <Text fontSize="xs" color={c.muted}>{entry.time}</Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
