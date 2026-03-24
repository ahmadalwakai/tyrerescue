'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, VStack, SimpleGrid, Heading } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface SoundSetting {
  id: string;
  event: string;
  soundFile: string;
  enabled: boolean;
  volume: number;
  vibrationEnabled: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

interface SoundLibraryItem {
  file: string;
  label: string;
  description: string;
}

const EVENT_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  new_job: { label: 'New Job Assigned', description: 'Plays when a new job is pushed to the driver', icon: '🚨' },
  job_accepted: { label: 'Job Accepted', description: 'Plays when a driver accepts a job', icon: '✅' },
  job_completed: { label: 'Job Completed', description: 'Plays when a driver marks a job as complete', icon: '🏁' },
  new_message: { label: 'New Message', description: 'Plays when a new chat message arrives', icon: '💬' },
};

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? c.accent : c.border,
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

export function DriverSoundsClient() {
  const [settings, setSettings] = useState<SoundSetting[]>([]);
  const [library, setLibrary] = useState<SoundLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/driver-sounds');
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings ?? []);
      setLibrary(data.library ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function patch(event: string, updates: Record<string, unknown>) {
    setSaving(event);
    try {
      const res = await fetch('/api/admin/driver-sounds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, ...updates }),
      });
      if (res.ok) await fetchData();
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px">
        <Text color={c.muted}>Loading sound settings…</Text>
      </Box>
    );
  }

  if (!settings.length) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px">
        <Text color={c.muted}>No sound settings found. Run the database migration to seed defaults.</Text>
      </Box>
    );
  }

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} gap={5}>
      {['new_job', 'job_accepted', 'job_completed', 'new_message'].map((event) => {
        const setting = settings.find((s) => s.event === event);
        if (!setting) return null;
        const meta = EVENT_LABELS[event] ?? { label: event, description: '', icon: '🔔' };
        const isSaving = saving === event;

        return (
          <Box
            key={event}
            bg={c.card}
            borderWidth="1px"
            borderColor={c.border}
            borderRadius="8px"
            p="20px"
            opacity={isSaving ? 0.7 : 1}
            transition="opacity 0.2s"
          >
            <Flex justify="space-between" align="center" mb={3}>
              <Flex align="center" gap={2}>
                <Text fontSize="xl">{meta.icon}</Text>
                <Box>
                  <Text fontWeight="600" color={c.text}>{meta.label}</Text>
                  <Text fontSize="xs" color={c.muted}>{meta.description}</Text>
                </Box>
              </Flex>
              <Toggle
                on={setting.enabled}
                disabled={isSaving}
                onToggle={() => patch(event, { enabled: !setting.enabled })}
              />
            </Flex>

            <VStack align="stretch" gap={3} mt={2}>
              {/* Sound file selector */}
              <Box>
                <Text fontSize="xs" color={c.muted} mb={1}>Sound File</Text>
                <select
                  value={setting.soundFile}
                  disabled={isSaving || !setting.enabled}
                  onChange={(e) => patch(event, { soundFile: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${c.border}`,
                    background: c.bg,
                    color: c.text,
                    fontSize: 14,
                    opacity: setting.enabled ? 1 : 0.5,
                  }}
                >
                  {library.map((item) => (
                    <option key={item.file} value={item.file}>
                      {item.label} — {item.file}
                    </option>
                  ))}
                </select>
              </Box>

              {/* Volume slider */}
              <Box>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="xs" color={c.muted}>Volume</Text>
                  <Text fontSize="xs" color={c.accent} fontWeight="600">
                    {Math.round(setting.volume * 100)}%
                  </Text>
                </Flex>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(setting.volume * 100)}
                  disabled={isSaving || !setting.enabled}
                  onChange={(e) => patch(event, { volume: Number(e.target.value) / 100 })}
                  style={{
                    width: '100%',
                    accentColor: c.accent,
                    opacity: setting.enabled ? 1 : 0.5,
                  }}
                />
              </Box>

              {/* Vibration toggle */}
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color={c.text}>Vibration</Text>
                <Toggle
                  on={setting.vibrationEnabled}
                  disabled={isSaving || !setting.enabled}
                  onToggle={() => patch(event, { vibrationEnabled: !setting.vibrationEnabled })}
                />
              </Flex>

              {/* Last updated */}
              {setting.updatedAt && (
                <Text fontSize="xs" color={c.muted} mt={1}>
                  Last updated {new Date(setting.updatedAt).toLocaleDateString()} by{' '}
                  {setting.updatedByName ?? 'system'}
                </Text>
              )}
            </VStack>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}
