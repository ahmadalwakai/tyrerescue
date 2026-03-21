'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Text,
  Flex,
  SimpleGrid,
  VStack,
  Table,
  Badge,
  Spinner,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'motion/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { GaugeMeter } from '@/components/admin/GaugeMeter';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';

const MotionBox = motion.create(Box);

/* ── Types matching the API response ── */

interface CWVCurrent {
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
}

interface SnapshotRow {
  id: string;
  date: string;
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
  totalTraffic: number;
  organicTraffic: number;
  directTraffic: number;
  socialTraffic: number;
  bounceRate: number;
  avgSessionDuration: number;
}

interface TrafficWeek {
  week: string;
  organic: number;
  direct: number;
  social: number;
  referral: number;
  total: number;
}

interface KeywordRow {
  keyword: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface PageRow {
  id: string;
  path: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h1Count: number | null;
  h2Count: number | null;
  imgWithoutAlt: number | null;
  wordCount: number | null;
  hasCanonical: boolean | null;
  hasOpenGraph: boolean | null;
  hasTwitterCard: boolean | null;
  hasJsonLd: boolean | null;
  statusCode: number | null;
  loadTimeMs: number | null;
  issues: Array<{ type: string; message: string; severity: string }> | null;
  lastCrawled: string | null;
}

interface HealthIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  path?: string;
}

interface SEOData {
  cwv: { current: CWVCurrent | null; history: SnapshotRow[]; lastChecked: string | null };
  traffic: { weeks: TrafficWeek[]; summary: { totalVisitors: number; organicPct: number; trend: number } };
  keywords: { list: KeywordRow[]; total: number };
  pages: { list: PageRow[]; stats: { total: number; withIssues: number; avgLoadTime: number } };
  schemas: { total: number; withJsonLd: number; withOg: number; withTwitter: number; withCanonical: number };
  health: { score: number; issues: HealthIssue[] };
  indexing: { totalPages: number; crawledPages: number; lastCrawl: string | null };
}

const TABS = ['overview', 'traffic', 'keywords', 'pages', 'schemas', 'history'] as const;
type TabKey = (typeof TABS)[number];

const TAB_ICONS: Record<TabKey, string> = {
  overview: '📊', traffic: '📈', keywords: '🔑', pages: '📄', schemas: '🧬', history: '🕒',
};

function cwvRating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t: Record<string, [number, number]> = {
    lcp: [2.5, 4], fid: [100, 300], cls: [0.1, 0.25], fcp: [1.8, 3], ttfb: [800, 1800],
  };
  const thresholds = t[metric];
  if (!thresholds) return 'good';
  return value <= thresholds[0] ? 'good' : value <= thresholds[1] ? 'needs-improvement' : 'poor';
}

const ratingColor = (r: string) =>
  r === 'good' ? '#22C55E' : r === 'needs-improvement' ? '#F59E0B' : '#EF4444';

/* ── Component ── */

export function SEODashboardClient() {
  const [data, setData] = useState<SEOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');
  const [crawling, setCrawling] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seo-analytics');
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 300_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const runCrawl = async () => {
    setCrawling(true);
    try {
      await fetch('/api/admin/seo-analytics/crawl', { method: 'POST' });
      await fetchData();
    } finally { setCrawling(false); }
  };

  const takeSnapshot = async () => {
    setSnapping(true);
    try {
      await fetch('/api/admin/seo-analytics/snapshot', { method: 'POST' });
      await fetchData();
    } finally { setSnapping(false); }
  };

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

  const { cwv, traffic, keywords, pages, schemas, health, indexing } = data;

  return (
    <VStack align="stretch" gap={6}>
      {/* ── Tab Navigation ── */}
      <Flex gap={2} flexWrap="wrap">
        {TABS.map((t) => (
          <Box
            as="button"
            key={t}
            onClick={() => setTab(t)}
            px={4}
            py={2}
            borderRadius="lg"
            fontWeight="600"
            fontSize="sm"
            bg={tab === t ? c.accent : c.surface}
            color={tab === t ? '#fff' : c.muted}
            border={`1px solid ${tab === t ? c.accent : c.border}`}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ bg: tab === t ? c.accentHover : c.card }}
            textTransform="capitalize"
          >
            {TAB_ICONS[t]} {t}
          </Box>
        ))}
      </Flex>

      <AnimatePresence mode="wait">
        <MotionBox
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'overview' && <OverviewTab cwv={cwv} health={health} indexing={indexing} traffic={traffic} />}
          {tab === 'traffic' && <TrafficTab traffic={traffic} />}
          {tab === 'keywords' && <KeywordsTab keywords={keywords} />}
          {tab === 'pages' && <PagesTab pages={pages} onCrawl={runCrawl} crawling={crawling} />}
          {tab === 'schemas' && <SchemasTab schemas={schemas} pagesTotal={pages.stats.total} />}
          {tab === 'history' && <HistoryTab history={cwv.history} onSnapshot={takeSnapshot} snapping={snapping} />}
        </MotionBox>
      </AnimatePresence>
    </VStack>
  );
}

/* ───────────── OVERVIEW TAB ───────────── */

function OverviewTab({ cwv, health, indexing, traffic }: {
  cwv: SEOData['cwv']; health: SEOData['health']; indexing: SEOData['indexing']; traffic: SEOData['traffic'];
}) {
  return (
    <VStack align="stretch" gap={6}>
      {/* Score gauges */}
      {cwv.current ? (
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          <GaugeMeter value={cwv.current.performanceScore} max={100} label="Performance" color="#22C55E" icon="⚡" />
          <GaugeMeter value={cwv.current.seoScore} max={100} label="SEO" color={c.accent} icon="🔍" />
          <GaugeMeter value={cwv.current.accessibilityScore} max={100} label="Accessibility" color="#3B82F6" icon="♿" />
          <GaugeMeter value={cwv.current.bestPracticesScore} max={100} label="Best Practices" color="#A855F7" icon="✅" />
        </SimpleGrid>
      ) : (
        <Box bg={c.card} p={6} borderRadius="12px" border={`1px solid ${c.border}`}>
          <Text color={c.accent} fontWeight="600" mb={2}>⚙️ PageSpeed API Not Configured</Text>
          <Text color={c.muted} fontSize="sm">
            Add GOOGLE_PAGESPEED_API_KEY to your .env.local to enable live Core Web Vitals.
            Get a free API key from the Google Cloud Console → APIs &amp; Services → PageSpeed Insights API.
          </Text>
        </Box>
      )}

      {/* CWV cards */}
      {cwv.current && (
        <SimpleGrid columns={{ base: 2, md: 5 }} gap={3}>
          {([
            { key: 'lcp', label: 'LCP', value: cwv.current.lcp, unit: 's' },
            { key: 'fid', label: 'FID', value: cwv.current.fid, unit: 'ms' },
            { key: 'cls', label: 'CLS', value: cwv.current.cls, unit: '' },
            { key: 'fcp', label: 'FCP', value: cwv.current.fcp, unit: 's' },
            { key: 'ttfb', label: 'TTFB', value: cwv.current.ttfb, unit: 'ms' },
          ] as const).map((m) => {
            const rating = cwvRating(m.key, m.value);
            return (
              <Box key={m.key} bg={c.card} p={4} borderRadius="12px" border={`1px solid ${c.border}`}>
                <Text color={c.muted} fontSize="xs" textTransform="uppercase" letterSpacing="1px" fontFamily="monospace">{m.label}</Text>
                <Text color={ratingColor(rating)} fontSize="2xl" fontWeight="700" fontFamily="monospace" mt={1}>
                  {m.value.toFixed(m.key === 'cls' ? 3 : m.key === 'fid' || m.key === 'ttfb' ? 0 : 2)}{m.unit}
                </Text>
                <Badge
                  mt={1}
                  bg={`${ratingColor(rating)}22`}
                  color={ratingColor(rating)}
                  px={2} py={0.5} borderRadius="full" fontSize="10px" fontWeight="600"
                >
                  {rating.replace('-', ' ')}
                </Badge>
              </Box>
            );
          })}
        </SimpleGrid>
      )}

      {/* Summary row */}
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
        <StatCard label="Health Score" value={`${health.score}/100`}
          color={health.score >= 80 ? '#22C55E' : health.score >= 50 ? c.accent : '#EF4444'} icon="💪" />
        <StatCard label="Total Pages" value={indexing.totalPages.toLocaleString()} color={c.text} icon="📄" />
        <StatCard label="Crawled" value={`${indexing.crawledPages}/${indexing.totalPages}`} color={c.accent} icon="🕷️" />
        <StatCard label="12-Week Traffic" value={traffic.summary.totalVisitors.toLocaleString()} color="#22C55E" icon="👥"
          trend={traffic.summary.trend > 0 ? 'up' : traffic.summary.trend < 0 ? 'down' : undefined}
          trendVal={`${traffic.summary.trend > 0 ? '+' : ''}${traffic.summary.trend}%`} />
      </SimpleGrid>

      {/* Issues */}
      {health.issues.length > 0 && (
        <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} p={5}>
          <Text color={c.text} fontWeight="600" mb={3}>
            Issues ({health.issues.filter((i) => i.severity === 'error').length} errors, {health.issues.filter((i) => i.severity === 'warning').length} warnings)
          </Text>
          <VStack align="stretch" gap={2} maxH="300px" overflowY="auto">
            {health.issues.slice(0, 30).map((issue, i) => (
              <Flex key={i} align="center" gap={3}>
                <Box w="8px" h="8px" borderRadius="full" flexShrink={0}
                  bg={issue.severity === 'error' ? '#EF4444' : issue.severity === 'warning' ? '#F59E0B' : '#3B82F6'} />
                <Text color={c.muted} fontSize="sm" flex={1}>{issue.message}</Text>
                {issue.path && <Text color={c.muted} fontSize="xs" fontFamily="monospace">{issue.path}</Text>}
              </Flex>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
}

/* ───────────── TRAFFIC TAB ───────────── */

function TrafficTab({ traffic }: { traffic: SEOData['traffic'] }) {
  const chartData = traffic.weeks.map((w) => ({
    ...w,
    label: new Date(w.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }));

  return (
    <VStack align="stretch" gap={6}>
      {/* Summary */}
      <SimpleGrid columns={{ base: 2, md: 3 }} gap={4}>
        <StatCard label="Total Visitors (12 wk)" value={traffic.summary.totalVisitors.toLocaleString()} color={c.text} icon="👥" />
        <StatCard label="Organic %" value={`${traffic.summary.organicPct}%`} color="#22C55E" icon="🌱" />
        <StatCard label="Trend" value={`${traffic.summary.trend > 0 ? '+' : ''}${traffic.summary.trend}%`}
          color={traffic.summary.trend >= 0 ? '#22C55E' : '#EF4444'} icon={traffic.summary.trend >= 0 ? '📈' : '📉'} />
      </SimpleGrid>

      {/* Stacked Area Chart */}
      <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} p={5}>
        <Text color={c.text} fontWeight="600" mb={4}>Weekly Traffic Breakdown</Text>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
              <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text }} />
              <Area type="monotone" dataKey="organic" stackId="1" stroke="#22C55E" fill="#22C55E" fillOpacity={0.4} name="Organic" />
              <Area type="monotone" dataKey="direct" stackId="1" stroke={c.accent} fill={c.accent} fillOpacity={0.3} name="Direct" />
              <Area type="monotone" dataKey="referral" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} name="Referral" />
              <Area type="monotone" dataKey="social" stackId="1" stroke="#A855F7" fill="#A855F7" fillOpacity={0.3} name="Social" />
              <Legend wrapperStyle={{ color: c.muted, fontSize: 12 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Text color={c.muted} fontSize="sm">No traffic data yet. Visitors will appear as your site receives traffic.</Text>
        )}
      </Box>

      {/* Table */}
      <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} overflow="hidden">
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
              {traffic.weeks.map((w) => (
                <Table.Row key={w.week} _hover={{ bg: c.surface }}>
                  <Table.Cell px={4} py={3} color={c.text} fontSize="sm">
                    {new Date(w.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="#22C55E" fontSize="sm" fontWeight="600">{w.organic}</Table.Cell>
                  <Table.Cell px={4} py={3} color={c.accent} fontSize="sm">{w.direct}</Table.Cell>
                  <Table.Cell px={4} py={3} color="#3B82F6" fontSize="sm">{w.referral}</Table.Cell>
                  <Table.Cell px={4} py={3} color="#A855F7" fontSize="sm">{w.social}</Table.Cell>
                  <Table.Cell px={4} py={3} color={c.text} fontSize="sm" fontWeight="600">{w.total}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Box>
    </VStack>
  );
}

/* ───────────── KEYWORDS TAB ───────────── */

function KeywordsTab({ keywords }: { keywords: SEOData['keywords'] }) {
  return (
    <VStack align="stretch" gap={6}>
      <StatCard label="Keywords Tracked (30 days)" value={keywords.total.toString()} color={c.accent} icon="🔑" />

      <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} overflow="hidden">
        <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
          <Text color={c.text} fontWeight="600">Search Keywords from Visitors</Text>
          <Text color={c.muted} fontSize="xs" mt={1}>Based on real search terms visitors used to find your site (last 30 days)</Text>
        </Box>
        {keywords.list.length > 0 ? (
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg={c.surface}>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Keyword</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Impressions</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Clicks</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>CTR</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {keywords.list.map((kw) => (
                  <Table.Row key={kw.keyword} _hover={{ bg: c.surface }}>
                    <Table.Cell px={4} py={3} color={c.text} fontWeight="500" fontSize="sm">{kw.keyword}</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{kw.impressions}</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.accent} fontSize="sm" fontWeight="600">{kw.clicks}</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{kw.ctr}%</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        ) : (
          <Box p={6}>
            <Text color={c.muted} fontSize="sm">No keyword data yet. Keywords appear when visitors arrive via search engines.</Text>
          </Box>
        )}
      </Box>
    </VStack>
  );
}

/* ───────────── PAGES TAB ───────────── */

function PagesTab({ pages, onCrawl, crawling }: {
  pages: SEOData['pages']; onCrawl: () => void; crawling: boolean;
}) {
  return (
    <VStack align="stretch" gap={6}>
      <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <SimpleGrid columns={{ base: 2, md: 3 }} gap={4} flex={1}>
          <StatCard label="Pages Crawled" value={pages.stats.total.toString()} color={c.text} icon="📄" />
          <StatCard label="With Issues" value={pages.stats.withIssues.toString()}
            color={pages.stats.withIssues > 0 ? '#EF4444' : '#22C55E'} icon="⚠️" />
          <StatCard label="Avg Load Time" value={`${pages.stats.avgLoadTime}ms`} color={c.accent} icon="⏱️" />
        </SimpleGrid>
        <Box
          as="button"
          onClick={crawling ? undefined : onCrawl}
          aria-disabled={crawling}
          px={5} py={3}
          bg={c.accent}
          color="#fff"
          borderRadius="lg"
          fontWeight="600"
          fontSize="sm"
          cursor={crawling ? 'wait' : 'pointer'}
          opacity={crawling ? 0.7 : 1}
          _hover={{ bg: c.accentHover }}
          transition="all 0.2s"
          whiteSpace="nowrap"
        >
          {crawling ? '🔄 Crawling…' : '🕷️ Run Crawl'}
        </Box>
      </Flex>

      {pages.list.length > 0 ? (
        <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg={c.surface}>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Path</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Title</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>H1</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Words</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Load</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Issues</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {pages.list.map((p) => {
                  const issueCount = p.issues?.length ?? 0;
                  const hasErrors = p.issues?.some((i) => i.severity === 'error');
                  return (
                    <Table.Row key={p.id} _hover={{ bg: c.surface }}>
                      <Table.Cell px={4} py={3} color={c.accent} fontSize="xs" fontFamily="monospace" maxW="180px" truncate>
                        {p.path}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} color={c.text} fontSize="sm" maxW="200px" truncate>
                        {p.title || '—'}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} color={p.h1Count === 1 ? c.muted : '#EF4444'} fontSize="sm" maxW="150px" truncate>
                        {p.h1 || '—'}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{p.wordCount ?? '—'}</Table.Cell>
                      <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{p.loadTimeMs ? `${p.loadTimeMs}ms` : '—'}</Table.Cell>
                      <Table.Cell px={4} py={3}>
                        {issueCount > 0 ? (
                          <Badge bg={hasErrors ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}
                            color={hasErrors ? '#EF4444' : '#F59E0B'} px={2} py={0.5} borderRadius="full" fontSize="xs">
                            {issueCount}
                          </Badge>
                        ) : (
                          <Badge bg="rgba(34,197,94,0.15)" color="#22C55E" px={2} py={0.5} borderRadius="full" fontSize="xs">✓</Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Badge bg={p.statusCode === 200 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}
                          color={p.statusCode === 200 ? '#22C55E' : '#EF4444'} px={2} py={0.5} borderRadius="full" fontSize="xs">
                          {p.statusCode ?? '—'}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      ) : (
        <Box bg={c.card} p={6} borderRadius="12px" border={`1px solid ${c.border}`}>
          <Text color={c.muted} fontSize="sm">No pages crawled yet. Click &quot;Run Crawl&quot; to analyze your site.</Text>
        </Box>
      )}
    </VStack>
  );
}

/* ───────────── SCHEMAS TAB ───────────── */

function SchemasTab({ schemas, pagesTotal }: { schemas: SEOData['schemas']; pagesTotal: number }) {
  const pct = (v: number) => pagesTotal > 0 ? Math.round((v / pagesTotal) * 100) : 0;

  const items = [
    { label: 'JSON-LD', value: schemas.withJsonLd, pct: pct(schemas.withJsonLd), color: '#22C55E', icon: '🏗️' },
    { label: 'Open Graph', value: schemas.withOg, pct: pct(schemas.withOg), color: '#3B82F6', icon: '📣' },
    { label: 'Twitter Card', value: schemas.withTwitter, pct: pct(schemas.withTwitter), color: '#1DA1F2', icon: '🐦' },
    { label: 'Canonical URL', value: schemas.withCanonical, pct: pct(schemas.withCanonical), color: '#A855F7', icon: '🔗' },
  ];

  return (
    <VStack align="stretch" gap={6}>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
        {items.map((item) => (
          <Box key={item.label} bg={c.card} p={5} borderRadius="12px" border={`1px solid ${c.border}`} position="relative" overflow="hidden">
            <Box position="absolute" top={0} left={0} right={0} h="3px"
              bg={`linear-gradient(90deg, transparent, ${item.color}, transparent)`} opacity={0.6} />
            <Text fontSize="xl" mb={1}>{item.icon}</Text>
            <Text color={c.muted} fontSize="xs" textTransform="uppercase" letterSpacing="1px" fontFamily="monospace">{item.label}</Text>
            <Text color={item.color} fontSize="2xl" fontWeight="700" fontFamily="monospace" mt={1}>{item.pct}%</Text>
            <Text color={c.muted} fontSize="xs" mt={1}>{item.value}/{pagesTotal} pages</Text>
            {/* Progress bar */}
            <Box mt={3} h="4px" bg={c.surface} borderRadius="full" overflow="hidden">
              <Box h="100%" w={`${item.pct}%`} bg={item.color} borderRadius="full" transition="width 1s ease-out" />
            </Box>
          </Box>
        ))}
      </SimpleGrid>

      {pagesTotal === 0 && (
        <Box bg={c.card} p={6} borderRadius="12px" border={`1px solid ${c.border}`}>
          <Text color={c.muted} fontSize="sm">
            No schema data available. Run a crawl from the Pages tab to analyze your site&apos;s structured data.
          </Text>
        </Box>
      )}
    </VStack>
  );
}

/* ───────────── HISTORY TAB ───────────── */

function HistoryTab({ history, onSnapshot, snapping }: {
  history: SnapshotRow[]; onSnapshot: () => void; snapping: boolean;
}) {
  const chartData = [...history].reverse().map((h) => ({
    date: new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    Performance: h.performanceScore,
    SEO: h.seoScore,
    Accessibility: h.accessibilityScore,
    'Best Practices': h.bestPracticesScore,
  }));

  return (
    <VStack align="stretch" gap={6}>
      <Flex justify="space-between" align="center">
        <Text color={c.text} fontWeight="600">Score History ({history.length} snapshots)</Text>
        <Box
          as="button"
          onClick={snapping ? undefined : onSnapshot}
          aria-disabled={snapping}
          px={5} py={3}
          bg={c.accent}
          color="#fff"
          borderRadius="lg"
          fontWeight="600"
          fontSize="sm"
          cursor={snapping ? 'wait' : 'pointer'}
          opacity={snapping ? 0.7 : 1}
          _hover={{ bg: c.accentHover }}
          transition="all 0.2s"
        >
          {snapping ? '📸 Saving…' : '📸 Take Snapshot'}
        </Box>
      </Flex>

      {chartData.length > 0 ? (
        <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} p={5}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
              <XAxis dataKey="date" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text }} />
              <Legend wrapperStyle={{ color: c.muted, fontSize: 12 }} />
              <Line type="monotone" dataKey="Performance" stroke="#22C55E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="SEO" stroke={c.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Accessibility" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Best Practices" stroke="#A855F7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <Box bg={c.card} p={6} borderRadius="12px" border={`1px solid ${c.border}`}>
          <Text color={c.muted} fontSize="sm">No snapshots yet. Click &quot;Take Snapshot&quot; to record your first data point.</Text>
        </Box>
      )}

      {/* History table */}
      {history.length > 0 && (
        <Box bg={c.card} borderRadius="12px" border={`1px solid ${c.border}`} overflow="hidden">
          <Box overflowX="auto">
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg={c.surface}>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Date</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Perf</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>SEO</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>A11y</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>BP</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>LCP</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>CLS</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Traffic</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.map((h) => (
                  <Table.Row key={h.id} _hover={{ bg: c.surface }}>
                    <Table.Cell px={4} py={3} color={c.text} fontSize="sm">
                      {new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Table.Cell>
                    <Table.Cell px={4} py={3} color={scoreColor(h.performanceScore)} fontSize="sm" fontWeight="600">{h.performanceScore}</Table.Cell>
                    <Table.Cell px={4} py={3} color={scoreColor(h.seoScore)} fontSize="sm" fontWeight="600">{h.seoScore}</Table.Cell>
                    <Table.Cell px={4} py={3} color={scoreColor(h.accessibilityScore)} fontSize="sm" fontWeight="600">{h.accessibilityScore}</Table.Cell>
                    <Table.Cell px={4} py={3} color={scoreColor(h.bestPracticesScore)} fontSize="sm" fontWeight="600">{h.bestPracticesScore}</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{h.lcp?.toFixed(2)}s</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{h.cls?.toFixed(3)}</Table.Cell>
                    <Table.Cell px={4} py={3} color={c.muted} fontSize="sm">{h.totalTraffic}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      )}
    </VStack>
  );
}

/* ───────────── Shared helpers ───────────── */

function StatCard({ label, value, color, icon, trend, trendVal }: {
  label: string; value: string; color: string; icon: string; trend?: 'up' | 'down'; trendVal?: string;
}) {
  return (
    <Box bg={c.card} p={4} borderRadius="12px" border={`1px solid ${c.border}`}>
      <Flex align="center" gap={2} mb={1}>
        <Text fontSize="16px">{icon}</Text>
        <Text color={c.muted} fontSize="xs" textTransform="uppercase" letterSpacing="1px" fontFamily="monospace">{label}</Text>
      </Flex>
      <Flex align="baseline" gap={2}>
        <Text color={color} fontSize="2xl" fontWeight="700" fontFamily="monospace">{value}</Text>
        {trend && trendVal && (
          <Text color={trend === 'up' ? '#22C55E' : '#EF4444'} fontSize="xs" fontWeight="600">
            {trend === 'up' ? '▲' : '▼'} {trendVal}
          </Text>
        )}
      </Flex>
    </Box>
  );
}

function scoreColor(score: number): string {
  return score >= 90 ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444';
}
