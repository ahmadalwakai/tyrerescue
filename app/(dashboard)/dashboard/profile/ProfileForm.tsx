'use client';

import { useState } from 'react';
import { Box, VStack, Text, Input, Button, Field } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface ProfileFormProps {
  user: { name: string; email: string; phone: string | null };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/dashboard/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      if (res.ok) {
        setMessage('Profile updated');
      } else {
        const data = await res.json();
        setMessage(data.error || 'Failed to update');
      }
    } catch {
      setMessage('Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <VStack align="stretch" gap={4}>
        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">Name</Field.Label>
          <Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            required
          />
        </Field.Root>

        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">Email</Field.Label>
          <Input value={user.email} readOnly bg={c.surface} />
        </Field.Root>

        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">Phone</Field.Label>
          <Input
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
          />
        </Field.Root>

        {message && (
          <Text fontSize="sm" color={message === 'Profile updated' ? 'green.400' : 'red.400'}>
            {message}
          </Text>
        )}

        <Button
          type="submit"
          bg={c.accent}
          color={c.bg}
          _hover={{ bg: c.accentHover }}
          loading={saving}
          alignSelf="flex-start"
        >
          Save Changes
        </Button>
      </VStack>
    </form>
  );
}
