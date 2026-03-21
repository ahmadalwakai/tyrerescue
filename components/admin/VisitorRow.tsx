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
  sessionDuration: number | null;
  consentGiven: boolean | null;
  ageGroup: string | null;
  gender: string | null;
  interests: string[] | null;
  isOnline: boolean | null;
  createdAt: string | null;
  pagesVisited: { path: string; title: string | null }[];
  buttonsClicked: { buttonText: string }[];
}

const MotionBox = motion.create(Box);

export function VisitorRow({ visitor, index }: { visitor: VisitorData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const dur = visitor.sessionDuration || 0;
  const duration = `${Math.floor(dur / 60)}m ${dur % 60}s`;

  return (
    <MotionBox
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Grid
        templateColumns={{ base: '1fr 1fr 40px', md: '1fr 1fr 0.7fr 0.7fr 40px' }}
        alignItems="center"
        p="10px 14px"
        borderBottom={`1px solid ${c.border}`}
        cursor="pointer"
        fontSize="12px"
        _hover={{ bg: 'rgba(255,255,255,0.03)' }}
        transition="background 0.2s"
        onClick={() => setExpanded(!expanded)}
      >
        <Box>
          <Text color={c.text} fontWeight="500" fontSize="13px">
            {visitor.city || 'Unknown'}, {visitor.country || 'UK'}
          </Text>
          <Text color={c.muted} fontSize="10px" fontFamily="monospace" mt="2px">
            {visitor.ipHash?.slice(0, 8) || '---'}
          </Text>
        </Box>
        <Box>
          <Text as="span" color={c.muted}>{visitor.device || 'Unknown'}</Text>
          <Text as="span" color={c.border} mx={1}>·</Text>
          <Text as="span" color="#818cf8" fontSize="11px">{visitor.referrer || 'Direct'}</Text>
        </Box>
        <Box display={{ base: 'none', md: 'block' }}>
          <Text color={c.muted}>{visitor.pagesVisited.length} pages</Text>
        </Box>
        <Box display={{ base: 'none', md: 'block' }}>
          <Text color="#10b981" fontFamily="monospace" fontSize="11px">{duration}</Text>
        </Box>
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
              templateColumns={{ base: '1fr', md: '1fr 1fr' }}
              gap={4}
              p="14px 14px 14px 28px"
              bg="rgba(15,23,42,0.6)"
              borderBottom={`1px solid ${c.border}`}
              fontSize="11px"
            >
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
              </Box>
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
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
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Demographics
                </Text>
                {visitor.consentGiven ? (
                  <>
                    {visitor.ageGroup && <Text color={c.muted}>Age: <Text as="span" color={c.text}>{visitor.ageGroup}</Text></Text>}
                    {visitor.gender && <Text color={c.muted}>Gender: <Text as="span" color={c.text}>{visitor.gender}</Text></Text>}
                  </>
                ) : (
                  <Text color={c.muted} fontStyle="italic">Consent not given</Text>
                )}
              </Box>
              <Box>
                <Text color={c.muted} mb="6px" textTransform="uppercase" letterSpacing="1px" fontSize="10px">
                  Interests
                </Text>
                {visitor.consentGiven && visitor.interests && visitor.interests.length > 0 ? (
                  <Flex wrap="wrap" gap="4px">
                    {visitor.interests.map((int, i) => (
                      <Text
                        key={i}
                        display="inline-block"
                        p="2px 8px"
                        bg="rgba(99,102,241,0.1)"
                        color="#a5b4fc"
                        borderRadius="4px"
                        fontSize="10px"
                      >
                        {int}
                      </Text>
                    ))}
                  </Flex>
                ) : (
                  <Text color={c.muted} fontStyle="italic">
                    {visitor.consentGiven ? 'No interests' : 'Requires consent'}
                  </Text>
                )}
              </Box>
            </Grid>
          </MotionBox>
        )}
      </AnimatePresence>
    </MotionBox>
  );
}
