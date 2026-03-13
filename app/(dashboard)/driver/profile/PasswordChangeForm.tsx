'use client';

import { useState } from 'react';
import { Box, VStack, Text, Input, Button, HStack, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate passwords
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/driver/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <VStack align="stretch" gap={4}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>
            Current Password
          </Text>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            required
          />
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>
            New Password
          </Text>
          <Input
            type="password"
            value={newPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            minLength={8}
            required
          />
          <Text fontSize="xs" color={c.muted} mt={1}>
            Minimum 8 characters
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>
            Confirm New Password
          </Text>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            minLength={8}
            required
          />
        </Box>

        {error && (
          <Text color="red.400" fontSize="sm">
            {error}
          </Text>
        )}

        {success && (
          <Text color="green.400" fontSize="sm">
            {success}
          </Text>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Changing Password...</Text>
            </HStack>
          ) : (
            'Change Password'
          )}
        </Button>
      </VStack>
    </form>
  );
}
