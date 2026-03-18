'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Badge, Flex, Textarea } from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';

interface Testimonial {
  id: string;
  authorName: string;
  rating: number | null;
  content: string;
  jobType: string | null;
  approved: boolean | null;
  featured: boolean | null;
}

export function TestimonialsClient({ testimonials }: { testimonials: Testimonial[] }) {
  const router = useRouter();
  const [items, setItems] = useState(testimonials);
  const [showAdd, setShowAdd] = useState(false);

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  async function toggleApproval(id: string, approved: boolean) {
    await fetch('/api/admin/testimonials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved: !approved }),
    });
    setItems(items.map((t) => (t.id === id ? { ...t, approved: !approved } : t)));
  }

  async function toggleFeatured(id: string, featured: boolean) {
    await fetch('/api/admin/testimonials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, featured: !featured }),
    });
    setItems(items.map((t) => (t.id === id ? { ...t, featured: !featured } : t)));
  }

  async function deleteTestimonial(id: string) {
    if (!confirm('Delete this testimonial?')) return;
    await fetch('/api/admin/testimonials', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems(items.filter((t) => t.id !== id));
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/testimonials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorName: fd.get('authorName'),
        content: fd.get('content'),
        rating: fd.get('rating') ? Number(fd.get('rating')) : null,
        jobType: fd.get('jobType') || null,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      router.refresh();
    }
  }

  return (
    <VStack align="stretch" gap={6}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} style={anim.fadeUp()}>
        <Box>
          <Heading size="lg" color={c.text}>Testimonials</Heading>
          <Text color={c.muted} mt={1}>Manage customer reviews displayed on the site</Text>
        </Box>
        <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={() => setShowAdd(!showAdd)} w={{ base: '100%', md: 'auto' }} minH="48px">
          {showAdd ? 'Cancel' : 'Add Testimonial'}
        </Button>
      </Flex>

      {showAdd && (
        <form onSubmit={handleAdd}>
        <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.3s')}>
          <VStack align="stretch" gap={3}>
            <Flex direction={{ base: 'column', md: 'row' }} gap={3}>
              <Input {...inputProps} name="authorName" placeholder="Author name" required flex="1" />
              <Input {...inputProps} name="rating" type="number" min={1} max={5} placeholder="Rating (1-5)" maxW={{ base: '100%', md: '160px' }} />
              <Input {...inputProps} name="jobType" placeholder="Job type" maxW={{ base: '100%', md: '160px' }} />
            </Flex>
            <Textarea {...textareaProps} name="content" placeholder="Testimonial content" required rows={3} />
            <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} alignSelf={{ base: 'stretch', md: 'flex-start' }} minH="48px">Save</Button>
          </VStack>
        </Box>
        </form>
      )}

      {/* Desktop table */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" display={{ base: 'none', md: 'block' }} style={anim.fadeUp('0.5s', '0.15s')}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Author</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Content</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Rating</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5} textAlign="center" py={8} color={c.muted}>No testimonials</Table.Cell>
              </Table.Row>
            )}
            {items.map((t) => (
              <Table.Row key={t.id} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.text} fontWeight="600">{t.authorName}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.muted} fontSize="sm" maxW="300px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{t.content}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.accent}>{t.rating ? '★'.repeat(t.rating) : '—'}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <HStack gap={1}>
                    <Badge bg={t.approved ? '#14532D' : '#7F1D1D'} color="white">{t.approved ? 'Approved' : 'Pending'}</Badge>
                    {t.featured && <Badge bg={c.accent} color="white">Featured</Badge>}
                  </HStack>
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <HStack gap={1}>
                    <Button size="xs" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleApproval(t.id, t.approved ?? false)}>
                      {t.approved ? 'Unapprove' : 'Approve'}
                    </Button>
                    <Button size="xs" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleFeatured(t.id, t.featured ?? false)}>
                      {t.featured ? 'Unfeature' : 'Feature'}
                    </Button>
                    <Button size="xs" bg="#7F1D1D" color="white" onClick={() => deleteTestimonial(t.id)}>Delete</Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Mobile cards */}
      <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
        {items.length === 0 ? (
          <Text textAlign="center" py={8} color={c.muted}>No testimonials</Text>
        ) : (
          items.map((t, i) => (
            <Box key={t.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} style={anim.stagger('fadeUp', i)}>
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontWeight="bold" color={c.text}>{t.authorName}</Text>
                <HStack gap={1}>
                  <Badge bg={t.approved ? '#14532D' : '#7F1D1D'} color="white" fontSize="xs">{t.approved ? 'Approved' : 'Pending'}</Badge>
                  {t.featured && <Badge bg={c.accent} color="white" fontSize="xs">Featured</Badge>}
                </HStack>
              </Flex>
              {t.rating && <Text fontSize="sm" color={c.accent} mb={1}>{'\u2605'.repeat(t.rating)}</Text>}
              <Text fontSize="sm" color={c.muted} mb={3} lineClamp={3}>{t.content}</Text>
              <VStack gap={2} align="stretch">
                <Flex gap={2}>
                  <Button flex={1} size="sm" minH="48px" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleApproval(t.id, t.approved ?? false)}>
                    {t.approved ? 'Unapprove' : 'Approve'}
                  </Button>
                  <Button flex={1} size="sm" minH="48px" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleFeatured(t.id, t.featured ?? false)}>
                    {t.featured ? 'Unfeature' : 'Feature'}
                  </Button>
                </Flex>
                <Button size="sm" w="100%" minH="48px" bg="#7F1D1D" color="white" onClick={() => deleteTestimonial(t.id)}>Delete</Button>
              </VStack>
            </Box>
          ))
        )}
      </VStack>
    </VStack>
  );
}
