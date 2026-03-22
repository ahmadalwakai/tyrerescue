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

export function PricingClient({ rules }: { rules: PricingRule[] }) {
  const router = useRouter();
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState<string | null>(null);
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addLabel, setAddLabel] = useState('');

  // VAT state removed - VAT has been removed from the pricing system

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

  // Dynamic pricing config state
  interface PricingConfigState {
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
  }
  const [pConfig, setPConfig] = useState<PricingConfigState | null>(null);
  const [pConfigSaving, setPConfigSaving] = useState(false);
  const [demandData, setDemandData] = useState<{
    current: { pageViews: number; callClicks: number; bookingStarts: number; bookingCompletes: number; whatsappClicks: number; surchargeApplied: string };
    history: Array<Record<string, unknown>>;
  } | null>(null);

  const fetchPricingConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing/config');
      if (res.ok) {
        const data = await res.json();
        setPConfig({
          nightSurchargePercent: Number(data.nightSurchargePercent ?? 15),
          nightStartHour: data.nightStartHour ?? 18,
          nightEndHour: data.nightEndHour ?? 6,
          manualSurchargePercent: Number(data.manualSurchargePercent ?? 0),
          manualSurchargeActive: data.manualSurchargeActive ?? false,
          demandSurchargePercent: Number(data.demandSurchargePercent ?? 0),
          demandThresholdClicks: data.demandThresholdClicks ?? 20,
          demandIncrementPercent: Number(data.demandIncrementPercent ?? 2),
          cookieReturnSurchargePercent: Number(data.cookieReturnSurchargePercent ?? 0),
          maxTotalSurchargePercent: Number(data.maxTotalSurchargePercent ?? 25),
        });
      }
    } catch { /* ignore */ }
  }, []);

  const fetchDemand = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing/demand');
      if (res.ok) setDemandData(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPricingConfig();
    fetchDemand();
    const interval = setInterval(fetchDemand, 60_000);
    return () => clearInterval(interval);
  }, [fetchPricingConfig, fetchDemand]);

  async function savePricingConfig(updates: Partial<PricingConfigState>) {
    setPConfigSaving(true);
    try {
      const res = await fetch('/api/admin/pricing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setPConfig((prev) => prev ? { ...prev, ...updates } : prev);
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

  // VAT functions removed - VAT has been removed from the pricing system

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

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  return (
    <VStack align="stretch" gap={6}>
      {/* VAT Settings removed - VAT has been removed from the pricing system */}

      {/* Live Demand Monitor */}
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
                <Text fontSize="xs" color={c.muted} textAlign="center">⚡ Powered by Groq AI — refreshes every 5 min</Text>
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
      {pConfig && (
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px" style={anim.fadeUp('0.5s', '0.1s')}>
          <Text fontSize="28px" color={c.text} mb={5} style={{ fontFamily: 'var(--font-display)' }}>
            DYNAMIC PRICING
          </Text>

          {/* Surge Alert Banner */}
          <Box mb={5}>
            <SurgeAlert
              isNight={(() => {
                const h = new Date().getHours();
                const s = pConfig.nightStartHour;
                const e = pConfig.nightEndHour;
                return s > e ? (h >= s || h < e) : (h >= s && h < e);
              })()}
              manualActive={pConfig.manualSurchargeActive}
              manualPercent={pConfig.manualSurchargePercent}
              demandPercent={pConfig.demandSurchargePercent}
              totalSurcharge={
                (pConfig.manualSurchargeActive ? pConfig.manualSurchargePercent : 0) +
                pConfig.demandSurchargePercent
              }
            />
          </Box>

          {/* Demand Circles */}
          {demandData && (
            <Box mb={6}>
              <DemandCircles
                visitors={demandData.current.pageViews}
                callClicks={demandData.current.callClicks}
                bookingStarts={demandData.current.bookingStarts}
                bookingCompletes={demandData.current.bookingCompletes}
                activeSurcharge={pConfig.demandSurchargePercent}
                threshold={pConfig.demandThresholdClicks}
              />
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
                bg={pConfig.manualSurchargeActive ? c.accent : c.border}
                color={pConfig.manualSurchargeActive ? '#09090B' : c.muted}
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
                onClick={() => savePricingConfig({ manualSurchargeActive: !pConfig.manualSurchargeActive })}
                opacity={pConfigSaving ? 0.5 : 1}
                pointerEvents={pConfigSaving ? 'none' : 'auto'}
              >
                {pConfig.manualSurchargeActive ? 'ON' : 'OFF'}
              </Box>
            </Flex>
            {pConfig.manualSurchargeActive && (
              <Flex gap={3} align="center" style={{ animation: 'fadeUp 0.3s ease-out both' }}>
                <Input
                  type="number"
                  w="100px"
                  value={pConfig.manualSurchargePercent}
                  onChange={(e) => setPConfig((p) => p ? { ...p, manualSurchargePercent: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ manualSurchargePercent: pConfig.manualSurchargePercent })}
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
                  value={pConfig.nightSurchargePercent}
                  onChange={(e) => setPConfig((p) => p ? { ...p, nightSurchargePercent: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ nightSurchargePercent: pConfig.nightSurchargePercent })}
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
                  value={pConfig.nightStartHour}
                  onChange={(e) => setPConfig((p) => p ? { ...p, nightStartHour: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ nightStartHour: pConfig.nightStartHour })}
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
                  value={pConfig.nightEndHour}
                  onChange={(e) => setPConfig((p) => p ? { ...p, nightEndHour: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ nightEndHour: pConfig.nightEndHour })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
              </Flex>
              <Text color={c.muted} fontSize="xs">🌙 {pConfig.nightStartHour}:00 – {pConfig.nightEndHour}:00</Text>
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
                  value={pConfig.demandThresholdClicks}
                  onChange={(e) => setPConfig((p) => p ? { ...p, demandThresholdClicks: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ demandThresholdClicks: pConfig.demandThresholdClicks })}
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
                  value={pConfig.demandIncrementPercent}
                  onChange={(e) => setPConfig((p) => p ? { ...p, demandIncrementPercent: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ demandIncrementPercent: pConfig.demandIncrementPercent })}
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
                  value={pConfig.maxTotalSurchargePercent}
                  onChange={(e) => setPConfig((p) => p ? { ...p, maxTotalSurchargePercent: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ maxTotalSurchargePercent: pConfig.maxTotalSurchargePercent })}
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
                  value={pConfig.cookieReturnSurchargePercent}
                  onChange={(e) => setPConfig((p) => p ? { ...p, cookieReturnSurchargePercent: Number(e.target.value) } : p)}
                  onBlur={() => savePricingConfig({ cookieReturnSurchargePercent: pConfig.cookieReturnSurchargePercent })}
                  {...inputProps}
                  h="36px"
                  fontSize="13px"
                />
                <Text color={c.muted} fontSize="xs">%</Text>
              </Flex>
            </Flex>
          </Box>
        </Box>
      )}

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
