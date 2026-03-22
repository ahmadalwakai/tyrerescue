'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { colorTokens as c } from '@/lib/design-tokens';
import { GaugeMeter } from './GaugeMeter';
import { VisitorRow } from './VisitorRow';
import { NotificationStack } from './NotificationToast';

const MotionBox = motion.create(Box);

// ── Pre-init AudioContext singleton for instant sound ──
let audioCtx: AudioContext | null = null;
function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch { /* silent */ }
  }
}

function playNotificationSound() {
  try {
    initAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* silent */ }
}

// ── Types ──
interface VisitorData {
  id: string;
  city: string | null;
  country: string | null;
  ipHash: string | null;
  device: string | null;
  browser: string | null;
  referrer: string | null;
  searchEngine: string | null;
  searchKeyword: string | null;
  sessionDuration: number | null;
  consentGiven: boolean | null;
  ageGroup: string | null;
  gender: string | null;
  interests: string[] | null;
  isOnline: boolean | null;
  createdAt: string | null;
  exitedAt: string | null;
  visitCount: number | null;
  previousVisits: string[] | null;
  pagesVisited: { path: string; title: string | null }[];
  buttonsClicked: { buttonText: string }[];
}

interface Stats {
  totalVisitors: number;
  liveCount: number;
  avgSessionDuration: number;
  trendPct: number;
  mobilePct: number;
  deviceBreakdown: { device: string | null; count: number }[];
  referrerBreakdown: { referrer: string | null; count: number }[];
  cityBreakdown: { city: string | null; count: number }[];
  ageBreakdown: { ageGroup: string | null; count: number }[];
  genderBreakdown: { gender: string | null; count: number }[];
  buttonBreakdown: { buttonText: string; count: number }[];
  topPages: { path: string; count: number }[];
  dailyTrend: { day: string; visitors: number }[];
  monthlyTrend: { month: string; visitors: number }[];
  browserBreakdown: { browser: string | null; count: number }[];
  engineBreakdown: { engine: string | null; count: number }[];
  topKeywords: { keyword: string | null; count: number }[];
  returningVisitors: number;
}

// ── Live Pulse ──
function LivePulse({ count }: { count: number }) {
  return (
    <Flex align="center" gap={2}>
      <Box position="relative" w="12px" h="12px">
        <MotionBox
          animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          position="absolute"
          inset={0}
          borderRadius="50%"
          bg="#10b981"
        />
        <Box position="absolute" inset="2px" borderRadius="50%" bg="#10b981" />
      </Box>
      <Text fontSize="13px" color="#10b981" fontWeight="600" fontFamily="monospace">
        {count} LIVE
      </Text>
    </Flex>
  );
}

const PIE_COLORS = ['#818cf8', '#10b981', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#8b5cf6'];

const TABS = [
  { id: 'live', label: 'Live Feed', icon: '⚡' },
  { id: 'weekly', label: 'Weekly', icon: '📊' },
  { id: 'monthly', label: 'Monthly', icon: '📈' },
  { id: 'heatmap', label: 'Clicks', icon: '🔥' },
  { id: 'keywords', label: 'Keywords', icon: '🔍' },
  { id: 'geo', label: 'Locations', icon: '🌍' },
] as const;

export function VisitorsDashboard() {
  const [visitors, setVisitors] = useState<VisitorData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; city: string | null; device: string | null; browser: string | null; searchKeyword?: string | null; searchEngine?: string | null; visitCount?: number | null; createdAt?: string | null }[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('tr_visitor_sound') !== 'off';
    return true;
  });
  const [activeTab, setActiveTab] = useState<string>('live');
  const lastSeenRef = useRef<string>(new Date().toISOString());
  const [demandInfo, setDemandInfo] = useState<{ surchargePercent: number; demandAutomation: boolean; currentHour: { pageViews: number; callClicks: number; bookingStarts: number } | null } | null>(null);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [res, demandRes, configRes] = await Promise.all([
        fetch('/api/admin/visitors?period=week&limit=50'),
        fetch('/api/admin/pricing/demand').catch(() => null),
        fetch('/api/admin/pricing/config').catch(() => null),
      ]);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setVisitors(data.visitors);
      setStats(data.stats);
      setError(null);

      // Parse demand info
      try {
        const dData = demandRes?.ok ? await demandRes.json() : null;
        const cData = configRes?.ok ? await configRes.json() : null;
        if (dData || cData) {
          setDemandInfo({
            surchargePercent: Number(cData?.manualSurchargePercent ?? 0),
            demandAutomation: (cData?.demandThresholdClicks ?? 0) > 0,
            currentHour: dData?.current ?? null,
          });
        }
      } catch { /* silent */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Init AudioContext on first user interaction
  useEffect(() => {
    const handler = () => initAudio();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, []);

  // Poll for live visitor arrivals (every 5s)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/visitors/live?since=${encodeURIComponent(lastSeenRef.current)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.visitors?.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const fresh = data.visitors.filter((v: { id: string }) => !existingIds.has(v.id));
            return [...fresh, ...prev].slice(0, 5);
          });
          if (soundEnabled) playNotificationSound();
          // Advance lastSeen so we don't re-fetch the same visitors
          const newest = data.visitors[0]?.createdAt;
          lastSeenRef.current = newest || new Date().toISOString();
        }
      } catch { /* silent */ }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(() => setNotifications((prev) => prev.slice(0, -1)), 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  // Sound toggle persistence
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('tr_visitor_sound', next ? 'on' : 'off');
    if (next) initAudio();
  };

  if (loading) {
    return (
      <Box p={5}>
        <Text color={c.muted}>Loading visitors dashboard...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={5}>
        <Text color="#ef4444" mb={3}>{error}</Text>
        <Box
          as="button"
          px={4}
          py={2}
          bg={c.accent}
          color="#000"
          borderRadius="md"
          fontSize="sm"
          fontWeight="600"
          cursor="pointer"
          onClick={() => { setLoading(true); fetchData(); }}
        >
          Retry
        </Box>
      </Box>
    );
  }

  const s = stats!;
  const maxBtnCount = Math.max(...(s.buttonBreakdown.map((b) => b.count) || [1]), 1);

  return (
    <Box position="relative">
      <NotificationStack
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
      />

      <Box p={{ base: '12px', md: '20px 20px 0' }}>
        {/* Header */}
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
          <Box>
            <Text fontSize="26px" fontWeight="800" letterSpacing="-0.5px" color={c.text}>
              Visitors
            </Text>
            <Text fontSize="12px" color={c.muted} fontFamily="monospace" mt={1}>
              Real-time analytics · UK GDPR Compliant
            </Text>
          </Box>
          <Flex align="center" gap={4}>
            <LivePulse count={s.liveCount} />
            <Box
              as="button"
              bg={soundEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}
              border={`1px solid ${soundEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`}
              borderRadius="8px"
              p="6px 12px"
              color={soundEnabled ? '#10b981' : '#ef4444'}
              fontSize="12px"
              cursor="pointer"
              fontFamily="monospace"
              transition="all 0.2s"
              onClick={toggleSound}
            >
              {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
            </Box>
          </Flex>
        </Flex>

        {/* Gauge Meters */}
        <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }} gap={3} mt={5}>
          <GaugeMeter
            value={s.totalVisitors}
            max={Math.max(s.totalVisitors * 1.5, 100)}
            label="This Week"
            color="#818cf8"
            icon="📅"
            trend={s.trendPct >= 0 ? 'up' : 'down'}
            trendValue={Math.abs(s.trendPct).toFixed(1)}
          />
          <GaugeMeter value={s.liveCount} max={30} label="Live Now" color="#10b981" icon="⚡" />
          <GaugeMeter value={s.avgSessionDuration} max={600} label="Avg Session (s)" color="#f97316" icon="⏱️" />
          <GaugeMeter
            value={0}
            max={15}
            label="Conv. Rate %"
            color="#06b6d4"
            icon="🎯"
          />
          <GaugeMeter value={s.mobilePct} max={100} label="Mobile %" color="#ec4899" icon="📱" />
        </Grid>

        {/* Demand Pricing Intelligence */}
        {demandInfo && (
          <Flex
            mt={4}
            p="10px 16px"
            bg={demandInfo.surchargePercent > 0 ? 'rgba(249,115,22,0.08)' : 'rgba(129,140,248,0.06)'}
            border={`1px solid ${demandInfo.surchargePercent > 0 ? 'rgba(249,115,22,0.25)' : 'rgba(129,140,248,0.15)'}`}
            borderRadius="10px"
            align="center"
            justify="space-between"
            flexWrap="wrap"
            gap={2}
          >
            <Flex align="center" gap={3}>
              <Text fontSize="13px" fontWeight="600" color={demandInfo.surchargePercent > 0 ? '#f97316' : c.muted} fontFamily="monospace">
                {demandInfo.surchargePercent > 0
                  ? `⚡ +${demandInfo.surchargePercent}% surcharge active`
                  : '✓ No surcharge'}
              </Text>
              {demandInfo.demandAutomation && (
                <Text fontSize="11px" color={c.muted} fontFamily="monospace" bg="rgba(129,140,248,0.1)" px={2} py="2px" borderRadius="4px">
                  AUTO
                </Text>
              )}
            </Flex>
            {demandInfo.currentHour && (
              <Flex gap={4}>
                <Text fontSize="11px" color={c.muted} fontFamily="monospace">
                  Views: {demandInfo.currentHour.pageViews}
                </Text>
                <Text fontSize="11px" color={c.muted} fontFamily="monospace">
                  Calls: {demandInfo.currentHour.callClicks}
                </Text>
                <Text fontSize="11px" color={c.muted} fontFamily="monospace">
                  Bookings: {demandInfo.currentHour.bookingStarts}
                </Text>
              </Flex>
            )}
            <a
              href="/admin/pricing"
              style={{ fontSize: '11px', color: '#818cf8', fontFamily: 'monospace', fontWeight: 600, textDecoration: 'none' }}
            >
              Manage →
            </a>
          </Flex>
        )}

        {/* Tab Navigation */}
        <Flex gap={1} mt={5} overflowX="auto" pb={1}>
          {TABS.map((tab) => (
            <Box
              key={tab.id}
              as="button"
              p="8px 16px"
              borderRadius="8px"
              border="none"
              bg={activeTab === tab.id ? 'rgba(129,140,248,0.15)' : 'transparent'}
              color={activeTab === tab.id ? '#818cf8' : c.muted}
              fontSize="12px"
              fontWeight="600"
              cursor="pointer"
              whiteSpace="nowrap"
              transition="all 0.2s"
              fontFamily="monospace"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </Box>
          ))}
        </Flex>
      </Box>

      {/* Tab Content */}
      <Box p={{ base: '12px', md: '12px 20px 40px' }}>
        <AnimatePresence mode="wait">
          {/* ── LIVE FEED ── */}
          {activeTab === 'live' && (
            <MotionBox key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} overflow="hidden">
                <Grid
                  templateColumns={{ base: '1fr 1fr 40px', md: '1fr 1fr 0.6fr 0.5fr 0.5fr 40px' }}
                  p="10px 14px"
                  bg="rgba(0,0,0,0.3)"
                  fontSize="10px"
                  color={c.muted}
                  textTransform="uppercase"
                  letterSpacing="1.2px"
                  fontFamily="monospace"
                >
                  <Text>Location / IP</Text>
                  <Text>Device / Source</Text>
                  <Text display={{ base: 'none', md: 'block' }}>Browser</Text>
                  <Text display={{ base: 'none', md: 'block' }}>Pages</Text>
                  <Text display={{ base: 'none', md: 'block' }}>In / Out</Text>
                  <Text />
                </Grid>
                <Box maxH="420px" overflowY="auto">
                  {visitors.length > 0 ? (
                    visitors.slice(0, 30).map((v, i) => <VisitorRow key={v.id} visitor={v} index={i} />)
                  ) : (
                    <Box p={8} textAlign="center">
                      <Text color={c.muted}>No visitors yet</Text>
                    </Box>
                  )}
                </Box>
              </Box>
              <Text textAlign="center" mt={3} fontSize="11px" color={c.muted}>
                Showing {Math.min(30, visitors.length)} of {s.totalVisitors} visitors · Auto-refreshing
              </Text>
            </MotionBox>
          )}

          {/* ── WEEKLY ── */}
          {activeTab === 'weekly' && (
            <MotionBox key="weekly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="16px" color={c.text} fontWeight="600">Weekly Visitor Traffic</Text>
                  <Text fontSize="12px" color={s.trendPct >= 0 ? '#10b981' : '#ef4444'} fontWeight="600" fontFamily="monospace">
                    {s.trendPct >= 0 ? '▲' : '▼'} {Math.abs(s.trendPct).toFixed(1)}% vs last week
                  </Text>
                </Flex>
                {s.dailyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={s.dailyTrend}>
                      <defs>
                        <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="day" stroke={c.border} tick={{ fill: c.muted, fontSize: 11 }} />
                      <YAxis stroke={c.border} tick={{ fill: c.muted, fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="visitors" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorV)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Box p={8} textAlign="center"><Text color={c.muted}>No data for this period</Text></Box>
                )}
              </Box>
            </MotionBox>
          )}

          {/* ── MONTHLY ── */}
          {activeTab === 'monthly' && (
            <MotionBox key="monthly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="16px" color={c.text} fontWeight="600">Monthly Visitor Trends</Text>
                  <Text fontSize="12px" color="#10b981" fontWeight="600" fontFamily="monospace">
                    Total: {s.monthlyTrend.reduce((a, b) => a + b.visitors, 0).toLocaleString()}
                  </Text>
                </Flex>
                {s.monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={s.monthlyTrend}>
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#818cf8" stopOpacity={0.2} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke={c.border} tick={{ fill: c.muted, fontSize: 10 }} />
                      <YAxis stroke={c.border} tick={{ fill: c.muted, fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="visitors" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Box p={8} textAlign="center"><Text color={c.muted}>No data for this period</Text></Box>
                )}
              </Box>

              {/* Traffic Sources */}
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5} mt={3}>
                <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>Traffic Sources</Text>
                <Flex align="center" flexWrap="wrap" gap={5}>
                  {s.referrerBreakdown.length > 0 && (
                    <Box w="200px" h="200px" flexShrink={0}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={s.referrerBreakdown.map((r) => ({ name: r.referrer || 'Direct', value: r.count }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {s.referrerBreakdown.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                  <Box flex={1} minW="150px">
                    {s.referrerBreakdown.map((d, i) => (
                      <Flex key={d.referrer} align="center" gap={2} mb="6px" fontSize="12px">
                        <Box w="10px" h="10px" borderRadius="3px" bg={PIE_COLORS[i % PIE_COLORS.length]} flexShrink={0} />
                        <Text color={c.muted} flex={1}>{d.referrer || 'Direct'}</Text>
                        <Text color={c.text} fontWeight="600" fontFamily="monospace">{d.count}</Text>
                      </Flex>
                    ))}
                  </Box>
                </Flex>
              </Box>
            </MotionBox>
          )}

          {/* ── CLICK HEATMAP ── */}
          {activeTab === 'heatmap' && (
            <MotionBox key="heatmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>🔥 Button Click Heatmap</Text>
                <Flex direction="column" gap={2}>
                  {s.buttonBreakdown.length > 0 ? (
                    s.buttonBreakdown.map((b, i) => {
                      const intensity = b.count / maxBtnCount;
                      return (
                        <MotionBox
                          key={b.buttonText}
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Flex
                            align="center"
                            gap={3}
                            p="10px 14px"
                            bg={`rgba(249,115,22,${intensity * 0.12})`}
                            border={`1px solid rgba(249,115,22,${intensity * 0.2})`}
                            borderRadius="10px"
                          >
                            <Text fontSize="12px" color={c.text} fontWeight="500" minW="150px" flexShrink={0}>
                              {b.buttonText}
                            </Text>
                            <Box flex={1} h="6px" bg="rgba(255,255,255,0.05)" borderRadius="3px" overflow="hidden">
                              <MotionBox
                                initial={{ width: 0 }}
                                animate={{ width: `${intensity * 100}%` }}
                                transition={{ duration: 0.8, delay: i * 0.05 }}
                                h="100%"
                                borderRadius="3px"
                                bg={`linear-gradient(90deg, #f97316, ${intensity > 0.7 ? '#ef4444' : '#fb923c'})`}
                              />
                            </Box>
                            <Text
                              fontSize="13px"
                              fontWeight="700"
                              color={intensity > 0.7 ? c.accent : c.muted}
                              fontFamily="monospace"
                              minW="30px"
                              textAlign="right"
                            >
                              {b.count}
                            </Text>
                          </Flex>
                        </MotionBox>
                      );
                    })
                  ) : (
                    <Box p={8} textAlign="center"><Text color={c.muted}>No clicks recorded yet</Text></Box>
                  )}
                </Flex>
              </Box>

              {/* Top Pages */}
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5} mt={3}>
                <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>📄 Most Visited Pages</Text>
                {s.topPages.length > 0 ? (
                  s.topPages.map((p, i) => {
                    const maxP = s.topPages[0]?.count || 1;
                    return (
                      <Flex key={p.path} align="center" gap="10px" mb={2} fontSize="12px">
                        <Text color={c.muted} w="16px" textAlign="right" fontFamily="monospace" fontSize="10px">{i + 1}</Text>
                        <Text color="#818cf8" flex={1} fontFamily="monospace">{p.path}</Text>
                        <Box w="80px" h="4px" bg="rgba(255,255,255,0.05)" borderRadius="2px" overflow="hidden">
                          <Box h="100%" w={`${(p.count / maxP) * 100}%`} bg="#818cf8" borderRadius="2px" transition="width 0.5s" />
                        </Box>
                        <Text color={c.muted} fontFamily="monospace" minW="24px" textAlign="right">{p.count}</Text>
                      </Flex>
                    );
                  })
                ) : (
                  <Box p={8} textAlign="center"><Text color={c.muted}>No page views recorded yet</Text></Box>
                )}
              </Box>
            </MotionBox>
          )}

          {/* ── KEYWORDS ── */}
          {activeTab === 'keywords' && (
            <MotionBox key="keywords" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Top Search Keywords */}
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="16px" color={c.text} fontWeight="600">🔍 Search Keywords</Text>
                  <Text fontSize="11px" color={c.muted} fontFamily="monospace">
                    {s.topKeywords.length} unique terms
                  </Text>
                </Flex>
                {s.topKeywords.length > 0 ? (
                  <Flex direction="column" gap={2}>
                    {s.topKeywords.map((k, i) => {
                      const maxK = s.topKeywords[0]?.count || 1;
                      const intensity = k.count / maxK;
                      return (
                        <Flex
                          key={k.keyword}
                          align="center"
                          gap={3}
                          p="8px 12px"
                          bg={`rgba(129,140,248,${intensity * 0.08})`}
                          border={`1px solid rgba(129,140,248,${intensity * 0.15})`}
                          borderRadius="8px"
                          fontSize="12px"
                        >
                          <Text color={c.muted} w="16px" textAlign="right" fontFamily="monospace" fontSize="10px">{i + 1}</Text>
                          <Text color="#818cf8" flex={1} fontFamily="monospace">{k.keyword || '(empty)'}</Text>
                          <Box flex={1} maxW="120px" h="4px" bg="rgba(255,255,255,0.05)" borderRadius="2px" overflow="hidden">
                            <Box h="100%" w={`${intensity * 100}%`} bg="#818cf8" borderRadius="2px" />
                          </Box>
                          <Text color={c.text} fontWeight="600" fontFamily="monospace" minW="24px" textAlign="right">{k.count}</Text>
                        </Flex>
                      );
                    })}
                  </Flex>
                ) : (
                  <Box p={8} textAlign="center"><Text color={c.muted}>No search keywords recorded yet</Text></Box>
                )}
              </Box>

              {/* Search Engine + Browser Breakdown */}
              <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3} mt={3}>
                <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                  <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>🌐 Search Engines</Text>
                  {s.engineBreakdown.length > 0 ? (
                    <Grid templateColumns="repeat(auto-fill, minmax(110px, 1fr))" gap="8px">
                      {s.engineBreakdown.map((e, i) => (
                        <Box
                          key={e.engine}
                          bg={`rgba(${i === 0 ? '129,140,248' : i === 1 ? '16,185,129' : '249,115,22'},0.08)`}
                          border={`1px solid rgba(${i === 0 ? '129,140,248' : i === 1 ? '16,185,129' : '249,115,22'},0.15)`}
                          borderRadius="10px"
                          p="12px 10px"
                          textAlign="center"
                        >
                          <Text fontSize="20px" fontWeight="700" color={PIE_COLORS[i % PIE_COLORS.length]} fontFamily="monospace">
                            {e.count}
                          </Text>
                          <Text fontSize="11px" color={c.muted} mt={1}>{e.engine || 'Unknown'}</Text>
                        </Box>
                      ))}
                    </Grid>
                  ) : (
                    <Text color={c.muted} fontStyle="italic" fontSize="11px">No search engine data yet</Text>
                  )}
                </Box>

                <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                  <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>🖥️ Browsers</Text>
                  {s.browserBreakdown.length > 0 ? (
                    s.browserBreakdown.slice(0, 8).map((b) => {
                      const maxB = s.browserBreakdown[0]?.count || 1;
                      const pct = Math.round((b.count / maxB) * 100);
                      return (
                        <Flex key={b.browser} align="center" gap={2} mb="6px" fontSize="11px">
                          <Text color={c.muted} w="80px">{b.browser || 'Unknown'}</Text>
                          <Box flex={1} h="5px" bg="rgba(255,255,255,0.05)" borderRadius="3px" overflow="hidden">
                            <Box h="100%" w={`${pct}%`} bg="#06b6d4" borderRadius="3px" transition="width 0.5s" />
                          </Box>
                          <Text color={c.muted} fontFamily="monospace" w="32px" textAlign="right">{b.count}</Text>
                        </Flex>
                      );
                    })
                  ) : (
                    <Text color={c.muted} fontStyle="italic" fontSize="11px">No browser data yet</Text>
                  )}
                </Box>
              </Grid>

              {/* Returning visitors stat */}
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5} mt={3}>
                <Flex justify="space-between" align="center">
                  <Text fontSize="16px" color={c.text} fontWeight="600">🔄 Returning Visitors</Text>
                  <Flex align="center" gap={3}>
                    <Text fontSize="28px" fontWeight="700" color="#f97316" fontFamily="monospace">{s.returningVisitors}</Text>
                    <Text fontSize="12px" color={c.muted}>
                      of {s.totalVisitors} ({s.totalVisitors > 0 ? Math.round((s.returningVisitors / s.totalVisitors) * 100) : 0}%)
                    </Text>
                  </Flex>
                </Flex>
              </Box>
            </MotionBox>
          )}

          {/* ── GEO / LOCATIONS ── */}
          {activeTab === 'geo' && (
            <MotionBox key="geo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5}>
                <Text fontSize="16px" color={c.text} fontWeight="600" mb={4}>🌍 Visitor Locations</Text>
                <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap="10px">
                  {s.cityBreakdown.length > 0 ? (
                    s.cityBreakdown.slice(0, 8).map((ci, i) => (
                      <MotionBox
                        key={ci.city}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06 }}
                        bg="rgba(129,140,248,0.06)"
                        border="1px solid rgba(129,140,248,0.12)"
                        borderRadius="12px"
                        p="14px 12px"
                        textAlign="center"
                      >
                        <Text fontSize="24px" fontWeight="800" color="#818cf8" fontFamily="monospace">{ci.count}</Text>
                        <Text fontSize="12px" color={c.muted} mt={1}>{ci.city || 'Unknown'}</Text>
                      </MotionBox>
                    ))
                  ) : (
                    <Box p={8} textAlign="center"><Text color={c.muted}>No location data yet</Text></Box>
                  )}
                </Grid>
              </Box>

              {/* Demographics */}
              <Box bg={c.surface} borderRadius="14px" border={`1px solid ${c.border}`} p={5} mt={3}>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="16px" color={c.text} fontWeight="600">👥 Demographics</Text>
                  <Text fontSize="10px" p="3px 8px" bg="rgba(16,185,129,0.1)" color="#10b981" borderRadius="4px" fontFamily="monospace">
                    UK GDPR · Consent-only data
                  </Text>
                </Flex>
                <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                  <Box>
                    <Text fontSize="11px" color={c.muted} mb="10px" textTransform="uppercase" letterSpacing="1px">Age Groups</Text>
                    {s.ageBreakdown.length > 0 ? (
                      s.ageBreakdown.map((ag) => {
                        const total = s.ageBreakdown.reduce((a, b) => a + b.count, 0);
                        const pct = total ? Math.round((ag.count / total) * 100) : 0;
                        return (
                          <Flex key={ag.ageGroup} align="center" gap={2} mb="6px" fontSize="11px">
                            <Text color={c.muted} w="36px">{ag.ageGroup || '?'}</Text>
                            <Box flex={1} h="5px" bg="rgba(255,255,255,0.05)" borderRadius="3px" overflow="hidden">
                              <Box h="100%" w={`${pct}%`} bg="#06b6d4" borderRadius="3px" transition="width 0.5s" />
                            </Box>
                            <Text color={c.muted} fontFamily="monospace" w="28px" textAlign="right">{pct}%</Text>
                          </Flex>
                        );
                      })
                    ) : (
                      <Text color={c.muted} fontStyle="italic" fontSize="11px">No age data (requires consent)</Text>
                    )}
                  </Box>
                  <Box>
                    <Text fontSize="11px" color={c.muted} mb="10px" textTransform="uppercase" letterSpacing="1px">Gender</Text>
                    {s.genderBreakdown.length > 0 ? (
                      s.genderBreakdown.map((g) => {
                        const total = s.genderBreakdown.reduce((a, b) => a + b.count, 0);
                        const pct = total ? Math.round((g.count / total) * 100) : 0;
                        const gColor = g.gender === 'Male' ? '#818cf8' : g.gender === 'Female' ? '#ec4899' : c.muted;
                        return (
                          <Flex key={g.gender} align="center" gap={2} mb="6px" fontSize="11px">
                            <Text color={c.muted} w="60px">{g.gender || '?'}</Text>
                            <Box flex={1} h="5px" bg="rgba(255,255,255,0.05)" borderRadius="3px" overflow="hidden">
                              <Box h="100%" w={`${pct}%`} bg={gColor} borderRadius="3px" transition="width 0.5s" />
                            </Box>
                            <Text color={c.muted} fontFamily="monospace" w="28px" textAlign="right">{pct}%</Text>
                          </Flex>
                        );
                      })
                    ) : (
                      <Text color={c.muted} fontStyle="italic" fontSize="11px">No gender data (requires consent)</Text>
                    )}
                  </Box>
                </Grid>
              </Box>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
    </Box>
  );
}
