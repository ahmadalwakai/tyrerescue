'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
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
      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text}>Pricing Rules</Heading>
        <Text color={c.muted} mt={1}>Configure pricing parameters used by the pricing engine</Text>
      </Box>

      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={anim.fadeUp('0.5s', '0.1s')}>
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
                  <Input
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

      <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text color={c.text} fontWeight="600" mb={3}>Add Rule</Text>
        <HStack gap={3}>
          <Input placeholder="Key" value={addKey} onChange={(e) => setAddKey(e.target.value)} {...inputStyle} maxW="180px" />
          <Input placeholder="Label" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} {...inputStyle} maxW="200px" />
          <Input placeholder="Value" value={addValue} onChange={(e) => setAddValue(e.target.value)} {...inputStyle} maxW="180px" />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={handleAdd}>Add</Button>
        </HStack>
      </Box>
    </VStack>
  );
}
