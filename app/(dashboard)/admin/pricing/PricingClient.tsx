'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';

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

  // VAT state
  const vatRule = items.find((r) => r.key === 'vat_registered');
  const vatNumRule = items.find((r) => r.key === 'vat_number');
  const [vatOn, setVatOn] = useState(vatRule?.value === 'true');
  const [vatNumber, setVatNumber] = useState(vatNumRule?.value || '');
  const [vatSaving, setVatSaving] = useState(false);

  async function toggleVat() {
    if (!vatRule) return;
    const newVal = !vatOn;
    setVatOn(newVal);
    setVatSaving(true);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: vatRule.id, value: String(newVal) }),
      });
      if (!res.ok) setVatOn(!newVal);
    } catch {
      setVatOn(!newVal);
    } finally {
      setVatSaving(false);
    }
  }

  async function saveVatNumber() {
    if (!vatNumRule) return;
    setVatSaving(true);
    await fetch('/api/admin/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vatNumRule.id, value: vatNumber }),
    });
    setVatSaving(false);
  }

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
      {/* VAT Settings */}
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px" mb="32px">
        <Text fontSize="28px" color={c.text} mb={5} style={{ fontFamily: 'var(--font-display)' }}>
          VAT SETTINGS
        </Text>

        <Flex justify="space-between" align="center" mb={vatOn ? 4 : 0}>
          <Box>
            <Text fontSize="15px" color={c.text} fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>
              Business is VAT Registered
            </Text>
            <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
              When enabled, 20% VAT applies to all bookings and your VAT number appears on invoices and receipts
            </Text>
          </Box>
          <Box
            as="button"
            w="80px"
            h="36px"
            borderRadius="18px"
            bg={vatOn ? c.accent : c.border}
            color={vatOn ? '#09090B' : c.muted}
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
            onClick={toggleVat}
            aria-disabled={vatSaving}
            pointerEvents={vatSaving ? 'none' : 'auto'}
            opacity={vatSaving ? 0.5 : 1}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {vatOn ? 'VAT ON' : 'VAT OFF'}
          </Box>
        </Flex>

        {vatOn && (
          <Box style={{ animation: 'fadeUp 0.3s ease-out both' }}>
            <Text fontSize="13px" color={c.muted} mb="6px" style={{ fontFamily: 'var(--font-body)' }}>
              VAT NUMBER
            </Text>
            <Flex gap="8px">
              <Input
                w="200px"
                placeholder="GB123456789"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                bg={c.input.bg}
                borderColor={c.input.border}
                color={c.input.text}
                fontSize="15px"
                height="40px"
                borderRadius="6px"
              />
              <Button
                bg={c.accent}
                color="#09090B"
                px="20px"
                h="40px"
                borderRadius="6px"
                fontSize="13px"
                fontWeight="600"
                onClick={saveVatNumber}
                disabled={vatSaving}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Save
              </Button>
            </Flex>
            <Text fontSize="11px" color={c.muted} mt={2} style={{ fontFamily: 'var(--font-body)' }}>
              Format: GB followed by 9 digits e.g. GB123456789
            </Text>
          </Box>
        )}
      </Box>

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
