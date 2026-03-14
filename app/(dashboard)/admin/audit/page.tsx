import { db, auditLogs, users } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import { Box, Heading, Text, VStack, Table, Badge } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function AdminAuditPage() {
  const logs = await db
    .select({
      id: auditLogs.id,
      actorRole: auditLogs.actorRole,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <VStack align="stretch" gap={6}>
      <Box style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Heading size="lg" color={c.text}>Audit Log</Heading>
        <Text color={c.muted} mt={1}>Recent administrative actions</Text>
      </Box>

      {/* Desktop table */}
      <Box display={{ base: 'none', md: 'block' }} bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Time</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Actor</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Action</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Entity</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Entity ID</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {logs.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5} textAlign="center" py={8} color={c.muted}>No audit entries</Table.Cell>
              </Table.Row>
            )}
            {logs.map((log) => (
              <Table.Row key={log.id} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.muted} fontSize="sm" whiteSpace="nowrap">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB') : '—'}
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Text color={c.text} fontSize="sm">{log.actorName || log.actorEmail || '—'}</Text>
                  {log.actorRole && <Badge bg={c.surface} color={c.muted} fontSize="xs">{log.actorRole}</Badge>}
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={c.accent} color="white">{log.action}</Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3} color={c.text} fontSize="sm">{log.entityType || '—'}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.muted} fontSize="xs" fontFamily="mono">
                  {log.entityId ? log.entityId.slice(0, 8) + '...' : '—'}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Mobile cards */}
      <VStack display={{ base: 'flex', md: 'none' }} gap={3} align="stretch">
        {logs.length === 0 && (
          <Text textAlign="center" py={8} color={c.muted}>No audit entries</Text>
        )}
        {logs.map((log, i) => (
          <Box key={log.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.05 + i * 0.05, 0.5).toFixed(2)}s both` }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Badge bg={c.accent} color="white">{log.action}</Badge>
              <Text color={c.muted} fontSize="xs">
                {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB') : '—'}
              </Text>
            </Box>
            <Text color={c.text} fontSize="sm" fontWeight="600">
              {log.actorName || log.actorEmail || '—'}
            </Text>
            {log.actorRole && <Badge bg={c.surface} color={c.muted} fontSize="xs" mt={1}>{log.actorRole}</Badge>}
            <Box display="flex" justifyContent="space-between" mt={2}>
              <Text color={c.muted} fontSize="xs">{log.entityType || '—'}</Text>
              <Text color={c.muted} fontSize="xs" fontFamily="mono">
                {log.entityId ? log.entityId.slice(0, 8) + '...' : '—'}
              </Text>
            </Box>
          </Box>
        ))}
      </VStack>
    </VStack>
  );
}
