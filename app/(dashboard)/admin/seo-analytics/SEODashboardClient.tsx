'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Text,
  Flex,
  SimpleGrid,
  VStack,
  Table,
  Tabs,
  Badge,
  Spinner,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

/* ---------- types ---------- */

interface CWVMetric {
  name: string;
  value: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  target: string;
}

interface SchemaResult {
  page: string;
  types: string[];
  errors: number;
  status: 'valid' | 'warning' | 'error';
}

interface IndexStatus {
  totalPages: number;
  indexed: number;
  notIndexed: number;
  errors: number;
  lastCrawl: string;
}

interface KeywordRank {
  keyword: string;
  position: number;
  change: number;
  url: string;
  impressions: number;
  clicks: number;
  ctr: string;
}

interface TrafficData {
  period: string;
  organic: number;
  direct: number;
  referral: number;
  social: number;
}

interface SEOData {
  cwv: CWVMetric[];
  schemas: SchemaResult[];
  indexing: IndexStatus;
  keywords: KeywordRank[];
  traffic: TrafficData[];
  siteHealth: { score: number; issues: string[] };
}

/* ---------- component ---------- */

export function SEODashboardClient() {
  const [data, setData] = useState<SEOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seo-analytics');
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300_000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner color={c.accent} size="lg" />
      </Flex>
    );
  }

  if (!data) {
    return (
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text color={c.muted}>Failed to load SEO data. Check API configuration.</Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" gap={6}>
      {/* Tab Navigation */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(d) => setActiveTab(d.value)}
        variant="enclosed"
      >
        <Tabs.List bg={c.surface} borderRadius="md" p={1}>
          {['overview', 'keywords', 'schemas', 'traffic'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              px={4}
              py={2}
              fontSize="sm"
              fontWeight="600"
              color={activeTab === tab ? c.accent : c.muted}
              bg={activeTab === tab ? c.card : 'transparent'}
              borderRadius="md"
              _hover={{ color: c.text }}
              cursor="pointer"
              textTransform="capitalize"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ------- OVERVIEW TAB ------- */}
        <Tabs.Content value="overview">
          <VStack align="stretch" gap={6} mt={4}>
            {/* Health Score */}
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
                <Text color={c.muted} fontSize="sm">Site Health Score</Text>
                <Text
                  color={data.siteHealth.score >= 80 ? '#22C55E' : data.siteHealth.score >= 60 ? c.accent : '#EF4444'}
                  fontSize="3xl"
                  fontWeight="700"
                  mt={1}
                >
                  {data.siteHealth.score}/100
                </Text>
              </Box>
              <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
                <Text color={c.muted} fontSize="sm">Pages Indexed</Text>
                <Text color={c.text} fontSize="3xl" fontWeight="700" mt={1}>
                  {data.indexing.indexed}/{data.indexing.totalPages}
                </Text>
              </Box>
              <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
                <Text color={c.muted} fontSize="sm">Indexing Errors</Text>
                <Text
                  color={data.indexing.errors > 0 ? '#EF4444' : '#22C55E'}
                  fontSize="3xl"
                  fontWeight="700"
                  mt={1}
                >
                  {data.indexing.errors}
                </Text>
              </Box>
            </SimpleGrid>

            {/* Core Web Vitals */}
            <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
                <Text color={c.text} fontWeight="600">Core Web Vitals</Text>
              </Box>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={0}>
                {data.cwv.map((m) => (
                  <Box
                    key={m.name}
                    p={5}
                    borderRightWidth={{ base: '0', md: '1px' }}
                    borderBottomWidth={{ base: '1px', md: '0' }}
                    borderColor={c.border}
                    _last={{ borderRightWidth: '0', borderBottomWidth: '0' }}
                  >
                    <Flex justify="space-between" align="center" mb={2}>
                      <Text color={c.muted} fontSize="sm">{m.name}</Text>
                      <Badge
                        bg={m.rating === 'good' ? 'rgba(34,197,94,0.15)' : m.rating === 'needs-improvement' ? 'rgba(249,115,22,0.15)' : 'rgba(239,68,68,0.15)'}
                        color={m.rating === 'good' ? '#22C55E' : m.rating === 'needs-improvement' ? c.accent : '#EF4444'}
                        px={2}
                        py={0.5}
                        borderRadius="full"
                        fontSize="xs"
                        fontWeight="600"
                      >
                        {m.rating.replace('-', ' ')}
                      </Badge>
                    </Flex>
                    <Text color={c.text} fontSize="2xl" fontWeight="700">{m.value}</Text>
                    <Text color={c.muted} fontSize="xs" mt={1}>Target: {m.target}</Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>

            {/* Issues */}
            {data.siteHealth.issues.length > 0 && (
              <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} p={5}>
                <Text color={c.text} fontWeight="600" mb={3}>Issues to Fix</Text>
                <VStack align="stretch" gap={2}>
                  {data.siteHealth.issues.map((issue, i) => (
                    <Flex key={i} align="center" gap={3}>
                      <Box w="6px" h="6px" borderRadius="full" bg="#EF4444" flexShrink={0} />
                      <Text color={c.muted} fontSize="sm">{issue}</Text>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            )}

            {/* Indexing Status */}
            <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} p={5}>
              <Text color={c.text} fontWeight="600" mb={3}>Indexing Status</Text>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
                <Box>
                  <Text color={c.muted} fontSize="xs">Total Pages</Text>
                  <Text color={c.text} fontSize="lg" fontWeight="600">{data.indexing.totalPages}</Text>
                </Box>
                <Box>
                  <Text color={c.muted} fontSize="xs">Indexed</Text>
                  <Text color="#22C55E" fontSize="lg" fontWeight="600">{data.indexing.indexed}</Text>
                </Box>
                <Box>
                  <Text color={c.muted} fontSize="xs">Not Indexed</Text>
                  <Text color={c.accent} fontSize="lg" fontWeight="600">{data.indexing.notIndexed}</Text>
                </Box>
                <Box>
                  <Text color={c.muted} fontSize="xs">Last Crawl</Text>
                  <Text color={c.text} fontSize="sm" fontWeight="600">{data.indexing.lastCrawl}</Text>
                </Box>
              </SimpleGrid>
            </Box>
          </VStack>
        </Tabs.Content>

        {/* ------- KEYWORDS TAB ------- */}
        <Tabs.Content value="keywords">
          <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} mt={4} overflow="hidden">
            <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.text} fontWeight="600">Keyword Rankings — Top Targets</Text>
              <Text color={c.muted} fontSize="xs" mt={1}>Position data from Google Search Console</Text>
            </Box>
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg={c.surface}>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Keyword</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Position</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Change</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Impressions</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Clicks</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>CTR</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>URL</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.keywords.map((kw) => (
                    <Table.Row key={kw.keyword} _hover={{ bg: c.surface }}>
                      <Table.Cell px={4} py={3} color={c.text} fontWeight="500" fontSize="sm">{kw.keyword}</Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Text color={kw.position <= 10 ? '#22C55E' : kw.position <= 20 ? c.accent : '#EF4444'} fontWeight="600">
                          {kw.position}
                        </Text>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Text color={kw.change > 0 ? '#22C55E' : kw.change < 0 ? '#EF4444' : c.muted} fontWeight="600" fontSize="sm">
                          {kw.change > 0 ? `+${kw.change}` : kw.change === 0 ? '—' : String(kw.change)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{kw.impressions.toLocaleString()}</Table.Cell>
                      <Table.Cell px={4} py={3} color={c.accent} fontSize="sm" fontWeight="600">{kw.clicks}</Table.Cell>
                      <Table.Cell px={4} py={3} color={c.muted} fontSize="xs" maxW="200px" truncate>{kw.ctr}</Table.Cell>
                      <Table.Cell px={4} py={3} color={c.muted} fontSize="xs" maxW="200px" truncate>{kw.url}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>
        </Tabs.Content>

        {/* ------- SCHEMAS TAB ------- */}
        <Tabs.Content value="schemas">
          <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} mt={4} overflow="hidden">
            <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.text} fontWeight="600">Schema Validation</Text>
              <Text color={c.muted} fontSize="xs" mt={1}>JSON-LD structured data status across pages</Text>
            </Box>
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg={c.surface}>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Page</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Schema Types</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Errors</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.schemas.map((s) => (
                    <Table.Row key={s.page} _hover={{ bg: c.surface }}>
                      <Table.Cell px={4} py={3} color={c.text} fontSize="sm">{s.page}</Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Flex gap={1} wrap="wrap">
                          {s.types.map((t) => (
                            <Badge key={t} bg={c.surface} color={c.muted} px={2} py={0.5} borderRadius="md" fontSize="xs">
                              {t}
                            </Badge>
                          ))}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell px={4} py={3} color={s.errors > 0 ? '#EF4444' : '#22C55E'} fontWeight="600" fontSize="sm">
                        {s.errors}
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Badge
                          bg={s.status === 'valid' ? 'rgba(34,197,94,0.15)' : s.status === 'warning' ? 'rgba(249,115,22,0.15)' : 'rgba(239,68,68,0.15)'}
                          color={s.status === 'valid' ? '#22C55E' : s.status === 'warning' ? c.accent : '#EF4444'}
                          px={2}
                          py={0.5}
                          borderRadius="full"
                          fontSize="xs"
                          fontWeight="600"
                          textTransform="capitalize"
                        >
                          {s.status}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>
        </Tabs.Content>

        {/* ------- TRAFFIC TAB ------- */}
        <Tabs.Content value="traffic">
          <VStack align="stretch" gap={4} mt={4}>
            <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
              <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
                <Text color={c.text} fontWeight="600">Traffic Trends — Last 12 Weeks</Text>
                <Text color={c.muted} fontSize="xs" mt={1}>Organic vs Direct vs Referral vs Social</Text>
              </Box>
              {/* Bar chart representation */}
              <Box p={4}>
                {data.traffic.map((week) => {
                  const total = week.organic + week.direct + week.referral + week.social;
                  const maxWidth = 100;
                  return (
                    <Flex key={week.period} align="center" mb={3} gap={3}>
                      <Text color={c.muted} fontSize="xs" w="60px" flexShrink={0}>{week.period}</Text>
                      <Flex flex={1} h="24px" borderRadius="4px" overflow="hidden" bg={c.surface}>
                        <Box
                          h="100%"
                          w={`${total > 0 ? (week.organic / total) * maxWidth : 0}%`}
                          bg="#22C55E"
                          title={`Organic: ${week.organic}`}
                        />
                        <Box
                          h="100%"
                          w={`${total > 0 ? (week.direct / total) * maxWidth : 0}%`}
                          bg={c.accent}
                          title={`Direct: ${week.direct}`}
                        />
                        <Box
                          h="100%"
                          w={`${total > 0 ? (week.referral / total) * maxWidth : 0}%`}
                          bg="#3B82F6"
                          title={`Referral: ${week.referral}`}
                        />
                        <Box
                          h="100%"
                          w={`${total > 0 ? (week.social / total) * maxWidth : 0}%`}
                          bg="#A855F7"
                          title={`Social: ${week.social}`}
                        />
                      </Flex>
                      <Text color={c.muted} fontSize="xs" w="50px" textAlign="right" flexShrink={0}>{total}</Text>
                    </Flex>
                  );
                })}
                {/* Legend */}
                <Flex gap={4} mt={4} wrap="wrap">
                  {[
                    { label: 'Organic', color: '#22C55E' },
                    { label: 'Direct', color: c.accent },
                    { label: 'Referral', color: '#3B82F6' },
                    { label: 'Social', color: '#A855F7' },
                  ].map((l) => (
                    <Flex key={l.label} align="center" gap={2}>
                      <Box w="10px" h="10px" borderRadius="2px" bg={l.color} />
                      <Text color={c.muted} fontSize="xs">{l.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </Box>

            {/* Traffic Summary Table */}
            <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
              <Box overflowX="auto">
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row bg={c.surface}>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Week</Table.ColumnHeader>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Organic</Table.ColumnHeader>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Direct</Table.ColumnHeader>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Referral</Table.ColumnHeader>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Social</Table.ColumnHeader>
                      <Table.ColumnHeader color={c.muted} px={4} py={3}>Total</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.traffic.map((w) => (
                      <Table.Row key={w.period} _hover={{ bg: c.surface }}>
                        <Table.Cell px={4} py={3} color={c.text} fontSize="sm">{w.period}</Table.Cell>
                        <Table.Cell px={4} py={3} color="#22C55E" fontSize="sm" fontWeight="600">{w.organic}</Table.Cell>
                        <Table.Cell px={4} py={3} color={c.accent} fontSize="sm">{w.direct}</Table.Cell>
                        <Table.Cell px={4} py={3} color="#3B82F6" fontSize="sm">{w.referral}</Table.Cell>
                        <Table.Cell px={4} py={3} color="#A855F7" fontSize="sm">{w.social}</Table.Cell>
                        <Table.Cell px={4} py={3} color={c.text} fontSize="sm" fontWeight="600">
                          {w.organic + w.direct + w.referral + w.social}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>
            </Box>
          </VStack>
        </Tabs.Content>
      </Tabs.Root>
    </VStack>
  );
}
