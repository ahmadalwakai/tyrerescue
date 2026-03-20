'use client';

import { Box, Flex, Text, Link as ChakraLink } from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens } from '@/lib/design-tokens';

const c = colorTokens;

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * Visible breadcrumb nav — subtle small text with "›" separators.
 * On mobile, collapses middle items to "…" showing only first + last two.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  // On mobile: show first item, "…", and last item if >3 items
  const abbreviate = items.length > 3;

  return (
    <Box as="nav" aria-label="Breadcrumb">
      {/* Desktop — full breadcrumb */}
      <Flex
        align="center"
        gap={1.5}
        flexWrap="wrap"
        display={{ base: abbreviate ? 'none' : 'flex', md: 'flex' }}
      >
        {items.map((item, i) => (
          <Flex key={i} align="center" gap={1.5}>
            {i > 0 && (
              <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                ›
              </Text>
            )}
            {item.href ? (
              <ChakraLink
                asChild
                fontSize="12px"
                color={c.muted}
                _hover={{ color: c.text }}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Link href={item.href}>{item.label}</Link>
              </ChakraLink>
            ) : (
              <Text
                fontSize="12px"
                color={c.accent}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {item.label}
              </Text>
            )}
          </Flex>
        ))}
      </Flex>

      {/* Mobile — abbreviated: Home › … › Current */}
      {abbreviate && (
        <Flex
          align="center"
          gap={1.5}
          display={{ base: 'flex', md: 'none' }}
        >
          <ChakraLink
            asChild
            fontSize="12px"
            color={c.muted}
            _hover={{ color: c.text }}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <Link href={items[0].href!}>{items[0].label}</Link>
          </ChakraLink>
          <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>›</Text>
          <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>…</Text>
          <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>›</Text>
          <Text
            fontSize="12px"
            color={c.accent}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {items[items.length - 1].label}
          </Text>
        </Flex>
      )}
    </Box>
  );
}
