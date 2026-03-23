'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Flex, Badge, Spinner } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';
import { DemandCircles } from '@/components/admin/pricing/DemandCircles';
import { SurgeAlert } from '@/components/admin/pricing/SurgeAlert';

interface PricingRule {
  id: string;
  key: string;
  value: string;
  label: string | null;
  type: string | null;
}

/** Shape returned by /api/admin/pricing/state — single source of truth */
interface PricingState {
  config: {
    id: string;
    nightSurchargePercent: number;
    nightStartHour: number;
    nightEndHour: number;
    manualSurchargePercent: number;
    manualSurchargeActive: boolean;
    demandSurchargePercent: number;
    demandThresholdClicks: number;
    demandIncrementPercent: number;
    cookieReturnSurchargePercent: number;
    maxTotalSurchargePercent: number;
  };
  live: {
    londonHour: number;
    hourStartIso: string;
    hourEndIso: string;
    isNightActive: boolean;
    nightPercent: number;
    manualPercent: number;
    manualActive: boolean;
    demandPercent: number;
    totalActivePercent: number;
  };
  demand: {
    pageViews: number;
    callClicks: number;
    bookingStarts: number;
    bookingCompletes: number;
    whatsappClicks: number;
    surchargeApplied: string;
    hasData: boolean;
  };
  suggestion: {
    enabled: boolean;
    text: string | null;
  };
}

export function PricingClient({ rules }: { rules: PricingRule[] }) {
  const router = useRouter();
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState<string | null>(null);
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addLabel, setAddLabel] = useState('');

  // Surge state
  const surgeEnabled = items.find((r) => r.key === 'surge_pricing_enabled')?.value === 'true';
  const [surgeData, setSurgeData] = useState<{
    multiplier: number;
    confidence: string;
    reasoning: string;
    demandLevel: string;
    demandSignals: Record<string, number | boolean>;
    aiPowered: boolean;
  } | null>(null);
  const [surgeLoading, setSurgeLoading] = useState(false);

  // Single truthful state from backend
  const [pState, setPState] = useState<PricingState | null>(null);
  const [pStateLoading, setPStateLoading] = useState(true);
  const [pStateError, setPStateError] = useState<string | null>(null);
  const [pConfigSaving, setPConfigSaving] = useState(false);

  const fetchPricingState = useCallback(async () => {
    try {
      setPStateError(null);
      const res = await fetch('/api/admin/pricing/state');
      if (!res.ok) {
        setPStateError(`Failed to load pricing state (${res.status})`);
        return;
      }
      const data: PricingState = await res.json();
      setPState(data);
    } catch {
      setPStateError('Failed to connect to pricing backend');
    } finally {
      setPStateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPricingState();
    const interval = setInterval(fetchPricingState, 60_000);
    return () => clearInterval(interval);
  }, [fetchPricingState]);

  async function savePricingConfig(updates: Partial<PricingState['config']>) {
    setPConfigSaving(true);
    try {
      const res = await fetch('/api/admin/pricing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        // Re-fetch truthful state from backend after save
        await fetchPricingState();
      }
    } catch { /* ignore */ } finally {
      setPConfigSaving(false);
    }
  }

  const fetchSurge = useCallback(async () => {
    setSurgeLoading(true);
    try {
      const res = await fetch('/api/admin/pricing/surge-check');
      if (res.ok) setSurgeData(await res.json());
    } catch { /* ignore */ } finally {
      setSurgeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (surgeEnabled) {
      fetchSurge();
      const interval = setInterval(fetchSurge, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [surgeEnabled, fetchSurge]);

  async function handleSave(id: string, value: string) {
    setSaving(id);
    await fetch('/api/admin/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, value }),
    });
    setSaving(null);
  }

  async function handleAdd() {
    if (!addKey || !addValue) return;
    const res = await fetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: addKey, value: addValue, label: addLabel }),
    });
    if (res.ok) {
      setAddKey('');
      setAddValue('');
      setAddLabel('');
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this pricing rule?')) return;
    await fetch('/api/admin/pricing', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems(items.filter((i) => i.id !== id));
  }

  // Local edit state for config form fields (tracks unsaved input changes)
  const [localConfig, setLocalConfig] = useState<Partial<PricingState['config']>>({});
  useEffect(() => {
    if (pState) setLocalConfig({});
  }, [pState]);

  const cfg = pState ? { ...pState.config, ...localConfig } : null;
  const live = pState?.live ?? null;
  const demand = pState?.demand ?? null;

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  return (
    <VStack align="stretch" gap={6}>
      {/* Live Demand Monitor (Groq AI surge) */}
      {surgeEnabled && (
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px" style={anim.fadeUp('0.5s', '0.05s')}>
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontSize="28px" color={c.text} style={{ fontFamily: 'var(--font-display)' }}>
              LIVE DEMAND MONITOR
            </Text>
            <Button size="sm" onClick={fetchSurge} disabled={surgeLoading} bg={c.surface} color={c.text} fontSize="12px">
              {surgeLoading ? <Spinner size="xs" /> : 'Refresh'}
            </Button>
          </Flex>

          {surgeData ? (
            <VStack align="stretch" gap={4}>
              <Flex align="center" gap={4}>
                <Text
                  fontSize="48px"
                  fontWeight="700"
                  color={surgeData.multiplier > 1.05 ? c.accent : surgeData.multiplier < 0.95 ? 'green.400' : c.text}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {surgeData.multiplier.toFixed(2)}x
                </Text>
                <VStack align="start" gap={1}>
                  <Badge
                    colorPalette={
                      surgeData.demandLevel === 'peak' || surgeData.demandLevel === 'high' ? 'red'
                        : surgeData.demandLevel === 'mild' ? 'orange'
                        : surgeData.demandLevel === 'low' ? 'green'
                        : 'gray'
                    }
                    size="sm"
                  >
                    {surgeData.demandLevel.toUpperCase()} DEMAND
                  </Badge>
                  <Badge colorPalette={surgeData.confidence === 'high' ? 'green' : surgeData.confidence === 'medium' ? 'orange' : 'gray'} size="sm" variant="outline">
                    {surgeData.confidence} confidence
                  </Badge>
                </VStack>
              </Flex>
              <Text fontSize="sm" color={c.muted}>{surgeData.reasoning}</Text>
              <Flex gap={4} flexWrap="wrap">
                <Box>
                  <Text fontSize="xs" color={c.muted}>Active bookings</Text>
                  <Text fontSize="lg" fontWeight="600" color={c.text}>{String(surgeData.demandSignals.activeBookingsToday)}</Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color={c.muted}>Emergency</Text>
                  <Text fontSize="lg" fontWeight="600" color={c.text}>{String(surgeData.demandSignals.emergencyPending)}</Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color={c.muted}>Drivers online</Text>
                  <Text fontSize="lg" fontWeight="600" color={c.text}>{String(surgeData.demandSignals.availableDrivers)}</Text>
                </Box>
              </Flex>
              {surgeData.aiPowered && (
                <Text fontSize="xs" color={c.muted} textAlign="center">Powered by Groq AI — refreshes every 5 min</Text>
              )}
            </VStack>
          ) : surgeLoading ? (
            <HStack justify="center" py={4}>
              <Spinner size="sm" color={c.accent} />
              <Text fontSize="sm" color={c.muted}>Analysing demand...</Text>
            </HStack>
          ) : (
            <Text fontSize="sm" color={c.muted}>Enable surge pricing to see live demand</Text>
          )}
        </Box>
      )}

      {/* Dynamic Pricing Controls */}
      {pStateLoading ? (
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px">
          <HStack justify="center" py={8}>
            <Spinner size="md" color={c.accent} />
            <Text color={c.muted}>Loading pricing configuration...</Text>
          </HStack>
        </Box>
      ) : pStateError ? (
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px">
          <Text color="#EF4444" fontWeight="600" mb={2}>Pricing State Error</Text>
          <Text color={c.muted} fontSize="sm">{pStateError}</Text>
          <Button size="sm" mt={3} onClick={fetchPricingState} bg={c.surface} color={c.text}>
            Retry
          </Button>
        </Box>
      ) : cfg && live ? (
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px" style={anim.fadeUp('0.5s', '0.1s')}>
          <Text fontSize="28px" color={c.text} mb={5} style={{ fontFamily: 'var(--font-display)' }}>
            DYNAMIC PRICING
          </Text>

          {/* Surge Alert Banner — uses backend-computed live state only */}
          <Box mb={5}>
            <SurgeAlert
              isNight={live.isNightActive}
              manualActive={live.manualActive}
              manualPercent={live.manualPercent}
              demandPercent={live.demandPercent}
              nightPercent={live.nightPercent}
              totalSurcharge={live.totalActivePercent}
              londonHour={live.londonHour}
            />
          </Box>

          {/* Demand Circles — uses real backend demand data */}
          {demand ? (
            <Box mb={6}>
              <DemandCircles
                visitors={demand.pageViews}
                callClicks={demand.callClicks}
                bookingStarts={demand.bookingStarts}
                bookingCompletes={demand.bookingCompletes}
                activeSurcharge={live.demandPercent}
                threshold={cfg.demandThresholdClicks}
                hasData={demand.hasData}
                hourWindow={`${String(live.londonHour).padStart(2, '0')}:00 – ${String((live.londonHour + 1) % 24).padStart(2, '0')}:00`}
              />
            </Box>
          ) : null}

          {/* Backend suggestion */}
          {pState?.suggestion.enabled && pState.suggestion.text && (
            <Box
              mb={5}
              p={3}
              bg="rgba(59,130,246,0.1)"
              borderRadius="8px"
              borderWidth="1px"
              borderColor="#3B82F6"
              textAlign="center"
            >
              <Text color="#3B82F6" fontSize="sm" fontWeight="600">
                {pState.suggestion.text}
              </Text>
            </Box>
          )}

          {/* Manual Override */}
          <Box mb={5} p={4} bg={c.surface} borderRadius="8px">
            <Flex justify="space-between" align="center" mb={3}>
              <Box>
                <Text fontSize="14px" color={c.text} fontWeight="600">Manual Surcharge</Text>
                <Text fontSize="12px" color={c.muted}>Override pricing with a flat percentage increase</Text>
              </Box>
              <Box
                as="button"
                w="80px"
                h="36px"
                borderRadius="18px"
                bg={cfg.manualSurchargeActive ? c.accent : c.border}
                color={cfg.manualSurchargeActive ? '#09090B' : c.muted}
                fontSize="12px"
                fontWeight="700"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                transition="all 0.2s"
                border="none"
                flexShrink={0}
                ml={4}
                onClick={() => savePricingConfig({ manualSurchargeActive: !cfg.manualSurchargeActive })}
                opacity={pConfigSaving ? 0.5 : 1}
                pointerEvents={pConfigSaving ? 'none' : 'auto'}
              >
                {cfg.manualSurchargeActive ? 'ON' : 'OFF'}
              </Box>
            </Flex>
            {cfg.manualSurchargeActive && (
              <Flex gap={3} align="center" style={{ animation: 'fadeUp 0.3s ease-out both' }}>
                <Input
                  type="number"
                  w="100px"
                  value={cfg.manualSurchargePercent}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, manualSurchargePercent: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ manualSurchargePercent: cfg.manualSurchargePercent })}
                  {...inputProps}
                  h="40px"
                />
                <Text color={c.muted} fontSize="sm">% surcharge on all bookings</Text>
              </Flex>
            )}
          </Box>

          {/* Night Pricing */}
          <Box mb={5} p={4} bg={c.surface} borderRadius="8px">
            <Text fontSize="14px" color={c.text} fontWeight="600" mb={2}>Night Pricing</Text>
            <Flex gap={3} flexWrap="wrap" align="center">
              <Flex gap={2} align="center">
                <Input
                  type="number"
                  w="70px"
                  min={0}
                  max={100}
                  value={cfg.nightSurchargePercent}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, nightSurchargePercent: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ nightSurchargePercent: cfg.nightSurchargePercent })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">% surcharge</Text>
              </Flex>
              <Flex gap={2} align="center">
                <Input
                  type="number"
                  w="60px"
                  min={0}
                  max={23}
                  value={cfg.nightStartHour}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, nightStartHour: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ nightStartHour: cfg.nightStartHour })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">to</Text>
                <Input
                  type="number"
                  w="60px"
                  min={0}
                  max={23}
                  value={cfg.nightEndHour}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, nightEndHour: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ nightEndHour: cfg.nightEndHour })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
              </Flex>
              <Text color={c.muted} fontSize="xs">
                {cfg.nightStartHour}:00 – {cfg.nightEndHour}:00
                {live.isNightActive ? ' (active now — London time)' : ''}
              </Text>
            </Flex>
          </Box>

          {/* Demand Automation Settings */}
          <Box mb={5} p={4} bg={c.surface} borderRadius="8px">
            <Text fontSize="14px" color={c.text} fontWeight="600" mb={2}>Demand Auto-Pricing</Text>
            <Text fontSize="12px" color={c.muted} mb={3}>
              Automatically increases prices when demand exceeds threshold
            </Text>
            <Flex gap={3} flexWrap="wrap">
              <Flex gap={2} align="center">
                <Text color={c.muted} fontSize="xs">Threshold:</Text>
                <Input
                  type="number"
                  w="70px"
                  value={cfg.demandThresholdClicks}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, demandThresholdClicks: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ demandThresholdClicks: cfg.demandThresholdClicks })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">clicks/hr</Text>
              </Flex>
              <Flex gap={2} align="center">
                <Text color={c.muted} fontSize="xs">Increment:</Text>
                <Input
                  type="number"
                  w="70px"
                  value={cfg.demandIncrementPercent}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, demandIncrementPercent: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ demandIncrementPercent: cfg.demandIncrementPercent })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">%</Text>
              </Flex>
              <Flex gap={2} align="center">
                <Text color={c.muted} fontSize="xs">Max cap:</Text>
                <Input
                  type="number"
                  w="70px"
                  value={cfg.maxTotalSurchargePercent}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, maxTotalSurchargePercent: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ maxTotalSurchargePercent: cfg.maxTotalSurchargePercent })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">%</Text>
              </Flex>
            </Flex>
          </Box>

          {/* Returning Visitor Surcharge */}
          <Box p={4} bg={c.surface} borderRadius="8px">
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="14px" color={c.text} fontWeight="600">Returning Visitor Surcharge</Text>
                <Text fontSize="12px" color={c.muted}>Extra % for visitors who return within the same session</Text>
              </Box>
              <Flex gap={2} align="center">
                <Input
                  type="number"
                  w="70px"
                  value={cfg.cookieReturnSurchargePercent}
                  onChange={(e) => setLocalConfig((p) => ({ ...p, cookieReturnSurchargePercent: Number(e.target.value) }))}
                  onBlur={() => savePricingConfig({ cookieReturnSurchargePercent: cfg.cookieReturnSurchargePercent })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">%</Text>
              </Flex>
            </Flex>
          </Box>
        </Box>
      ) : null}

      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text}>Pricing Rules</Heading>
        <Text color={c.muted} mt={1}>Configure pricing parameters used by the pricing engine</Text>
      </Box>

      {/* Desktop table */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={anim.fadeUp('0.5s', '0.1s')} display={{ base: 'none', md: 'block' }}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Key</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Label</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Value</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((rule, i) => (
              <Table.Row key={rule.id} _hover={{ bg: c.surface }} style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.05)}>
                <Table.Cell px={4} py={3} color={c.text} fontFamily="mono" fontSize="sm">{rule.key}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{rule.label || '—'}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Input {...inputProps}
                    size="sm"
                    defaultValue={rule.value}
                    onBlur={(e) => {
                      if (e.target.value !== rule.value) handleSave(rule.id, e.target.value);
                    }}
                    {...inputStyle}
                    maxW="200px"
                  />
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Button size="xs" bg="#7F1D1D" color="white" _hover={{ bg: '#991B1B' }} onClick={() => handleDelete(rule.id)}>
                    Delete
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Mobile cards */}
      <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
        {items.map((rule) => (
          <Box key={rule.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4}>
            <Text fontSize="xs" color={c.muted} mb={1}>{rule.label || rule.key}</Text>
            <Text fontFamily="mono" fontSize="sm" color={c.muted} mb={2}>{rule.key}</Text>
            <Input {...inputProps}
              size="sm"
              defaultValue={rule.value}
              onBlur={(e) => {
                if (e.target.value !== rule.value) handleSave(rule.id, e.target.value);
              }}
              mb={2}
            />
            <Button size="sm" w="100%" minH="48px" bg="#7F1D1D" color="white" _hover={{ bg: '#991B1B' }} onClick={() => handleDelete(rule.id)}>
              Delete
            </Button>
          </Box>
        ))}
      </VStack>

      <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text color={c.text} fontWeight="600" mb={3}>Add Rule</Text>
        <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
          <Input {...inputProps} placeholder="Key" value={addKey} onChange={(e) => setAddKey(e.target.value)} />
          <Input {...inputProps} placeholder="Label" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} />
          <Input {...inputProps} placeholder="Value" value={addValue} onChange={(e) => setAddValue(e.target.value)} />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={handleAdd} w="100%" minH="48px">Add</Button>
        </VStack>
        <HStack gap={3} display={{ base: 'none', md: 'flex' }}>
          <Input {...inputProps} placeholder="Key" value={addKey} onChange={(e) => setAddKey(e.target.value)} {...inputStyle} maxW="180px" />
          <Input {...inputProps} placeholder="Label" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} {...inputStyle} maxW="200px" />
          <Input {...inputProps} placeholder="Value" value={addValue} onChange={(e) => setAddValue(e.target.value)} {...inputStyle} maxW="180px" />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={handleAdd}>Add</Button>
        </HStack>
      </Box>
    </VStack>
  );
}
