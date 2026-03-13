'use client';

import { useState } from 'react';
import { Box, VStack, Text, Input, Button, Field } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    if (newPassword.length < 8) {
      setMessage('Password must be at least 8 characters');
      setIsError(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      setIsError(true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setMessage('Password changed successfully');
        setIsError(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setMessage(data.error || 'Failed to change password');
        setIsError(true);
      }
    } catch {
      setMessage('Failed to change password');
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <VStack align="stretch" gap={4}>
        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">Current Password</Field.Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
            required
          />
        </Field.Root>

        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">New Password</Field.Label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
            required
          />
        </Field.Root>

        <Field.Root>
          <Field.Label color={c.muted} fontSize="sm">Confirm New Password</Field.Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
            required
          />
        </Field.Root>

        {message && (
          <Text fontSize="sm" color={isError ? 'red.400' : 'green.400'}>
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
          Change Password
        </Button>
      </VStack>
    </form>
  );
}
