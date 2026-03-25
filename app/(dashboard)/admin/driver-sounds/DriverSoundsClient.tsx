'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  bundled: boolean;
  id?: string;
  url?: string;
}

const EVENT_ORDER = [
  'new_job',
  'reassignment',
  'upcoming_v2',
  'job_accepted',
  'job_completed',
  'new_message',
] as const;

const CRITICAL_EVENTS = new Set(['new_job', 'reassignment', 'upcoming_v2']);

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  new_job: { label: 'New Job Assigned', description: 'Plays when a new job is pushed to the driver' },
  reassignment: { label: 'Job Reassignment', description: 'Plays when a job is reassigned to this driver' },
  upcoming_v2: { label: 'Upcoming Job Reminder', description: 'Plays 30 min before a scheduled job starts' },
  job_accepted: { label: 'Job Accepted', description: 'Plays when a driver accepts a job' },
  job_completed: { label: 'Job Completed', description: 'Plays when a driver marks a job as complete' },
  new_message: { label: 'New Message', description: 'Plays when a new chat message arrives' },
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

function CriticalBadge() {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
        background: '#dc2626',
        color: '#fff',
        letterSpacing: '0.02em',
        lineHeight: '14px',
        verticalAlign: 'middle',
      }}
    >
      CRITICAL
    </span>
  );
}

export function DriverSoundsClient() {
  const [settings, setSettings] = useState<SoundSetting[]>([]);
  const [library, setLibrary] = useState<SoundLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/driver-sounds/upload', { method: 'POST', body: form });
      if (res.ok) await fetchData();
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setDeleting(assetId);
    try {
      const res = await fetch(`/api/admin/driver-sounds/${assetId}`, { method: 'DELETE' });
      if (res.ok) await fetchData();
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px">
        <Text color={c.muted}>Loading sound settings…</Text>
      </Box>
    );
  }

  const uploadedAssets = library.filter((l) => !l.bundled);

  return (
    <VStack align="stretch" gap={6}>
      {/* Sound Library */}
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="20px">
        <Flex justify="space-between" align="center" mb={4}>
          <Box>
            <Heading size="sm" color={c.text}>Sound Library</Heading>
            <Text fontSize="xs" color={c.muted}>Upload custom sounds (WAV, MP3, OGG — max 2 MB)</Text>
          </Box>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 6,
              background: c.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload Sound'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
        </Flex>

        {uploadedAssets.length === 0 ? (
          <Text fontSize="sm" color={c.muted}>No custom sounds uploaded yet. The bundled "new_job.wav" is always available.</Text>
        ) : (
          <VStack align="stretch" gap={2}>
            {uploadedAssets.map((asset) => (
              <Flex
                key={asset.id}
                align="center"
                justify="space-between"
                p="10px 12px"
                bg={c.bg}
                borderRadius="6px"
                borderWidth="1px"
                borderColor={c.border}
              >
                <Box>
                  <Text fontSize="sm" fontWeight="500" color={c.text}>{asset.label}</Text>
                  <Text fontSize="xs" color={c.muted}>{asset.file}</Text>
                </Box>
                <button
                  type="button"
                  disabled={deleting === asset.id}
                  onClick={() => asset.id && handleDeleteAsset(asset.id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 4,
                    border: `1px solid ${c.border}`,
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: deleting === asset.id ? 'not-allowed' : 'pointer',
                    opacity: deleting === asset.id ? 0.5 : 1,
                  }}
                >
                  {deleting === asset.id ? 'Deleting…' : 'Delete'}
                </button>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>

      {/* Event Sound Settings Grid */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={5}>
        {EVENT_ORDER.map((event) => {
          const setting = settings.find((s) => s.event === event);
          const meta = EVENT_LABELS[event] ?? { label: event, description: '' };
          const isCritical = CRITICAL_EVENTS.has(event);
          const isSaving = saving === event;

          return (
            <Box
              key={event}
              bg={c.card}
              borderWidth="1px"
              borderColor={isCritical ? '#dc262640' : c.border}
              borderRadius="8px"
              p="20px"
              opacity={isSaving ? 0.7 : 1}
              transition="opacity 0.2s"
            >
              <Flex justify="space-between" align="center" mb={3}>
                <Box>
                  <Flex align="center" gap={2} mb={0.5}>
                    <Text fontWeight="600" color={c.text}>{meta.label}</Text>
                    {isCritical && <CriticalBadge />}
                  </Flex>
                  <Text fontSize="xs" color={c.muted}>{meta.description}</Text>
                </Box>
                <Toggle
                  on={setting?.enabled ?? true}
                  disabled={isSaving || isCritical}
                  onToggle={() => patch(event, { enabled: !(setting?.enabled ?? true) })}
                />
              </Flex>

              <VStack align="stretch" gap={3} mt={2}>
                {/* Sound file selector */}
                <Box>
                  <Text fontSize="xs" color={c.muted} mb={1}>Sound File</Text>
                  <select
                    value={setting?.soundFile ?? 'new_job.wav'}
                    disabled={isSaving || !(setting?.enabled ?? true)}
                    onChange={(e) => patch(event, { soundFile: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${c.border}`,
                      background: c.bg,
                      color: c.text,
                      fontSize: 14,
                      opacity: (setting?.enabled ?? true) ? 1 : 0.5,
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
                    <Text fontSize="xs" color={c.muted}>
                      Volume {isCritical && <span style={{ color: '#dc2626' }}>(min 30%)</span>}
                    </Text>
                    <Text fontSize="xs" color={c.accent} fontWeight="600">
                      {Math.round((setting?.volume ?? 1) * 100)}%
                    </Text>
                  </Flex>
                  <input
                    type="range"
                    min={isCritical ? 30 : 0}
                    max={100}
                    step={5}
                    value={Math.round((setting?.volume ?? 1) * 100)}
                    disabled={isSaving || !(setting?.enabled ?? true)}
                    onChange={(e) => patch(event, { volume: Number(e.target.value) / 100 })}
                    style={{
                      width: '100%',
                      accentColor: c.accent,
                      opacity: (setting?.enabled ?? true) ? 1 : 0.5,
                    }}
                  />
                </Box>

                {/* Vibration toggle */}
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" color={c.text}>Vibration</Text>
                  <Toggle
                    on={setting?.vibrationEnabled ?? true}
                    disabled={isSaving || !(setting?.enabled ?? true)}
                    onToggle={() => patch(event, { vibrationEnabled: !(setting?.vibrationEnabled ?? true) })}
                  />
                </Flex>

                {/* Last updated */}
                {setting?.updatedAt && (
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
    </VStack>
  );
}
