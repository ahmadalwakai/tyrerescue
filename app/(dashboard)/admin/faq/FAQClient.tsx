'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Flex, Textarea } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  displayOrder: number | null;
  active: boolean | null;
}

export function FAQClient({ faqs }: { faqs: FAQ[] }) {
  const router = useRouter();
  const [items, setItems] = useState(faqs);
  const [showAdd, setShowAdd] = useState(false);

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  async function toggleActive(id: string, active: boolean) {
    await fetch('/api/admin/faq', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !active }),
    });
    setItems(items.map((f) => (f.id === id ? { ...f, active: !active } : f)));
  }

  async function deleteFAQ(id: string) {
    if (!confirm('Delete this FAQ?')) return;
    await fetch('/api/admin/faq', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems(items.filter((f) => f.id !== id));
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: fd.get('question'),
        answer: fd.get('answer'),
        displayOrder: fd.get('displayOrder') ? Number(fd.get('displayOrder')) : null,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      router.refresh();
    }
  }

  return (
    <VStack align="stretch" gap={6}>
      <Flex justify="space-between" align="center">
        <Box>
          <Heading size="lg" color={c.text}>FAQs</Heading>
          <Text color={c.muted} mt={1}>Manage frequently asked questions</Text>
        </Box>
        <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : 'Add FAQ'}
        </Button>
      </Flex>

      {showAdd && (
        <form onSubmit={handleAdd}>
        <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <VStack align="stretch" gap={3}>
            <HStack gap={3}>
              <Input name="question" placeholder="Question" required {...inputStyle} />
              <Input name="displayOrder" type="number" placeholder="Order" {...inputStyle} maxW="100px" />
            </HStack>
            <Textarea name="answer" placeholder="Answer" required {...inputStyle} rows={3} />
            <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} alignSelf="flex-start">Save</Button>
          </VStack>
        </Box>
        </form>
      )}

      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3} w="60px">#</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Question</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Answer</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={4} textAlign="center" py={8} color={c.muted}>No FAQs</Table.Cell>
              </Table.Row>
            )}
            {items.map((faq) => (
              <Table.Row key={faq.id} _hover={{ bg: c.surface }} opacity={faq.active ? 1 : 0.5}>
                <Table.Cell px={4} py={3} color={c.muted}>{faq.displayOrder ?? '—'}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text} fontWeight="600">{faq.question}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.muted} fontSize="sm" maxW="400px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{faq.answer}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <HStack gap={1}>
                    <Button size="xs" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleActive(faq.id, faq.active ?? true)}>
                      {faq.active ? 'Hide' : 'Show'}
                    </Button>
                    <Button size="xs" bg="#7F1D1D" color="white" onClick={() => deleteFAQ(faq.id)}>Delete</Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </VStack>
  );
}
