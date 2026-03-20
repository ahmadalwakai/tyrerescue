'use client';

import Link from 'next/link';
import { Box, Heading, Text, Flex } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { LINKABLE_ENTITIES } from '@/lib/linking/rules';
import type { LinkableEntity } from '@/lib/linking/types';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  accent: colorTokens.accent,
  text: colorTokens.text,
  muted: colorTokens.muted,
  border: colorTokens.border,
};

/**
 * Renders a grid of contextually-related internal pages.
 * Excludes the current page and any already-linked URLs,
 * then picks the top N by priority with category diversity.
 */
export function RelatedContent({
  currentUrl,
  currentCategory,
  existingLinks = [],
  max = 6,
}: {
  currentUrl: string;
  currentCategory: string;
  existingLinks?: string[];
  max?: number;
}) {
  const excluded = new Set([currentUrl, ...existingLinks]);

  const scored = LINKABLE_ENTITIES
    .filter((e) => !excluded.has(e.url))
    .map((e) => ({
      ...e,
      score: entityScore(e, currentCategory),
    }))
    .sort((a, b) => b.score - a.score);

  // Pick top items, ensuring category diversity (max 2 per category)
  const picks: (LinkableEntity & { score: number })[] = [];
  const catCounts = new Map<string, number>();

  for (const item of scored) {
    if (picks.length >= max) break;
    const count = catCounts.get(item.category) ?? 0;
    if (count >= 2) continue;
    picks.push(item);
    catCounts.set(item.category, count + 1);
  }

  if (picks.length === 0) return null;

  return (
    <Box mt={12}>
      <Heading
        as="h2"
        fontSize="20px"
        fontWeight="800"
        color={colors.text}
        mb={5}
        letterSpacing="-0.02em"
      >
        You Might Also Need
      </Heading>

      <Flex gap={3} wrap="wrap">
        {picks.map((p) => (
          <Link
            key={p.url}
            href={p.url}
            style={{ textDecoration: 'none', flex: '1 1 calc(50% - 6px)', minWidth: '240px' }}
          >
            <Box
              bg={colors.surface}
              borderRadius="8px"
              border="1px solid"
              borderColor={colors.border}
              p={4}
              transition="border-color 0.2s ease"
              _hover={{ borderColor: colors.accent }}
            >
              <Text
                fontSize="11px"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.05em"
                color={colors.accent}
                mb={1}
              >
                {categoryLabel(p.category)}
              </Text>
              <Text fontWeight="700" color={colors.text} fontSize="14px" lineClamp={1}>
                {p.title}
              </Text>
            </Box>
          </Link>
        ))}
      </Flex>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

function entityScore(e: LinkableEntity, currentCategory: string): number {
  let s = e.priority / 10;
  // Prefer different categories for diversity
  if (e.category !== currentCategory) s += 0.3;
  // Emergency always important
  if (e.category === 'emergency') s += 0.2;
  return s;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    emergency: 'Emergency',
    service: 'Service',
    location: 'Area',
    blog: 'Guide',
    comparison: 'Compare',
  };
  return map[cat] ?? cat;
}
