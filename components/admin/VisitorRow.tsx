'use client';

import { useState } from 'react';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'motion/react';
import { colorTokens as c } from '@/lib/design-tokens';

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

const MotionBox = motion.create(Box);

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return '—'; }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return '—'; }
}

export function VisitorRow({ visitor, index }: { visitor: VisitorData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isReturning = (visitor.visitCount || 1) > 1;

  return (
    <MotionBox
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Grid
        templateColumns={{ base: '1fr 1fr 40px', md: '1fr 1fr 0.6fr 0.5fr 0.5fr 40px' }}
        alignItems="center"
        p="10px 14px"
        borderBottom={`1px solid ${c.border}`}
        cursor="pointer"
        fontSize="12px"
        _hover={{ bg: 'rgba(255,255,255,0.03)' }}
        transition="background 0.2s"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Location + status dot */}
        <Flex align="center" gap="8px">
          <Box
            w="8px"
            h="8px"
            borderRadius="50%"
            bg={visitor.isOnline ? '#10b981' : '#475569'}
            flexShrink={0}
            boxShadow={visitor.isOnline ? '0 0 6px rgba(16,185,129,0.5)' : 'none'}
          />
          <Box>
            <Flex align="center" gap="6px">
              <Text color={c.text} fontWeight="500" fontSize="13px">
                {visitor.city || 'Unknown'}, {visitor.country || 'UK'}
              </Text>
              {isReturning && (
                <Text fontSize="9px" p="1px 5px" bg="rgba(249,115,22,0.15)" color={c.accent} borderRadius="3px" fontWeight="600">
                  ×{visitor.visitCount}
                </Text>
              )}
            </Flex>
            <Text color={c.muted} fontSize="10px" fontFamily="monospace" mt="2px">
              {visitor.ipHash?.slice(0, 8) || '---'}
            </Text>
          </Box>
        </Flex>
        {/* Device + Source */}
        <Box>
          <Text as="span" color={c.muted}>{visitor.device || 'Unknown'}</Text>
          <Text as="span" color={c.border} mx={1}>·</Text>
          <Text as="span" color="#818cf8" fontSize="11px">{visitor.referrer || 'Direct'}</Text>
        </Box>
        {/* Browser / Engine */}
        <Box display={{ base: 'none', md: 'block' }}>
          <Text color={c.muted} fontSize="11px">{visitor.browser || '—'}</Text>
          {visitor.searchEngine && (
            <Text color="#06b6d4" fontSize="10px">{visitor.searchEngine}</Text>
          )}
        </Box>
        {/* Pages */}
        <Box display={{ base: 'none', md: 'block' }}>
          <Text color={c.muted}>{visitor.pagesVisited.length} pages</Text>
        </Box>
        {/* In / Out */}
        <Box display={{ base: 'none', md: 'block' }}>
          <Text color="#10b981" fontFamily="monospace" fontSize="10px">{fmtTime(visitor.createdAt)}</Text>
          <Text color={visitor.exitedAt ? '#ef4444' : c.muted} fontFamily="monospace" fontSize="10px">
            {visitor.exitedAt ? fmtTime(visitor.exitedAt) : visitor.isOnline ? 'still here' : '—'}
          </Text>
        </Box>
        {/* Expand arrow */}
        <Box color={c.muted} transform={expanded ? 'rotate(180deg)' : 'rotate(0)'} transition="transform 0.2s" textAlign="center">
          ▾
        </Box>
      </Grid>

      <AnimatePresence>
        {expanded && (
          <MotionBox
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            overflow="hidden"
          >
            <Grid
              templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }}
              gap={4}
              p="14px 14px 14px 28px"
              bg="rgba(15,23,42,0.6)"
              borderBottom={`1px solid ${c.border}`}
              fontSize="11px"
            >
              {/* Column 1: Session Timeline */}
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Session Timeline
                </Text>
                <Flex align="center" gap="6px" mb="4px">
                  <Box w="6px" h="6px" borderRadius="50%" bg="#10b981" flexShrink={0} />
                  <Text color={c.muted}>Entry: <Text as="span" color={c.text}>{fmtTime(visitor.createdAt)}</Text></Text>
                </Flex>
                <Flex align="center" gap="6px" mb="4px">
                  <Box w="6px" h="6px" borderRadius="50%" bg={visitor.exitedAt ? '#ef4444' : c.border} flexShrink={0} />
                  <Text color={c.muted}>
                    Exit: <Text as="span" color={visitor.exitedAt ? c.text : c.muted}>{visitor.exitedAt ? fmtTime(visitor.exitedAt) : 'still here'}</Text>
                  </Text>
                </Flex>
                {visitor.sessionDuration != null && visitor.sessionDuration > 0 && (
                  <Text color={c.muted} mt="2px">
                    Duration: <Text as="span" color="#f97316" fontFamily="monospace">{Math.floor(visitor.sessionDuration / 60)}m {visitor.sessionDuration % 60}s</Text>
                  </Text>
                )}
                {isReturning && visitor.previousVisits && visitor.previousVisits.length > 0 && (
                  <Box mt="8px">
                    <Text color={c.muted} mb="4px" fontSize="10px" textTransform="uppercase" letterSpacing="1px">
                      Previous Visits ({visitor.previousVisits.length})
                    </Text>
                    {visitor.previousVisits.slice(0, 5).map((d, i) => (
                      <Text key={i} color={c.muted} fontSize="10px" fontFamily="monospace">
                        {fmtDate(d)} {fmtTime(d)}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Column 2: Pages + Buttons */}
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Pages Visited
                </Text>
                {visitor.pagesVisited.length > 0 ? (
                  visitor.pagesVisited.map((p, i) => (
                    <Text key={i} color="#818cf8" mb="3px">
                      <Text as="span" color={c.border}>→</Text> {p.path}
                    </Text>
                  ))
                ) : (
                  <Text color={c.muted} fontStyle="italic">No pages tracked</Text>
                )}
                <Text color={c.muted} mt="10px" mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Buttons Clicked
                </Text>
                {visitor.buttonsClicked.length > 0 ? (
                  <Flex wrap="wrap" gap="6px">
                    {visitor.buttonsClicked.map((b, i) => (
                      <Text
                        key={i}
                        display="inline-block"
                        p="3px 8px"
                        bg="rgba(249,115,22,0.12)"
                        color={c.accent}
                        borderRadius="4px"
                        fontSize="10px"
                      >
                        {b.buttonText}
                      </Text>
                    ))}
                  </Flex>
                ) : (
                  <Text color={c.muted} fontStyle="italic">No clicks recorded</Text>
                )}
              </Box>

              {/* Column 3: Search & Tech */}
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Search & Tech
                </Text>
                {visitor.searchKeyword && (
                  <Text color={c.muted} mb="3px">
                    Keyword: <Text as="span" color="#818cf8" fontWeight="500">{visitor.searchKeyword}</Text>
                  </Text>
                )}
                {visitor.searchEngine && (
                  <Text color={c.muted} mb="3px">
                    Engine: <Text as="span" color="#06b6d4">{visitor.searchEngine}</Text>
                  </Text>
                )}
                <Text color={c.muted} mb="3px">
                  Browser: <Text as="span" color={c.text}>{visitor.browser || '—'}</Text>
                </Text>
                <Text color={c.muted} mb="3px">
                  Device: <Text as="span" color={c.text}>{visitor.device || '—'}</Text>
                </Text>
                <Text color={c.muted} mb="3px">
                  Referrer: <Text as="span" color={c.text}>{visitor.referrer || 'Direct'}</Text>
                </Text>
                {visitor.consentGiven && (
                  <>
                    {visitor.ageGroup && <Text color={c.muted}>Age: <Text as="span" color={c.text}>{visitor.ageGroup}</Text></Text>}
                    {visitor.gender && <Text color={c.muted}>Gender: <Text as="span" color={c.text}>{visitor.gender}</Text></Text>}
                  </>
                )}
              </Box>
            </Grid>
          </MotionBox>
        )}
      </AnimatePresence>
    </MotionBox>
  );
}
