'use client';

import Link from 'next/link';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  SimpleGrid,
  Badge,
} from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import type { BlogArticle } from '@/lib/blog/articles';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const categoryColors: Record<string, string> = {
  emergency: '#EF4444',
  maintenance: '#3B82F6',
  fitting: '#10B981',
  safety: '#F59E0B',
};

function ArticleCard({ article, index }: { article: BlogArticle; index: number }) {
  return (
    <Link href={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
      <Box
        bg={colors.surface}
        borderRadius="12px"
        border="1px solid"
        borderColor={colors.border}
        p={6}
        h="100%"
        transition="border-color 0.2s ease, transform 0.2s ease"
        _hover={{ borderColor: colors.accent, transform: 'translateY(-2px)' }}
        style={anim.stagger('fadeUp', index, '0.4s', 0.2, 0.08)}
      >
        <Flex gap={2} mb={3} align="center">
          <Badge
            bg={categoryColors[article.category] ?? colors.accent}
            color="white"
            fontSize="11px"
            px={2}
            py={0.5}
            borderRadius="4px"
            fontWeight="600"
            textTransform="uppercase"
          >
            {article.category}
          </Badge>
          <Text color={colors.textSecondary} fontSize="12px">
            {article.readingTime} min read
          </Text>
        </Flex>
        <Heading
          as="h2"
          fontSize={{ base: '18px', md: '20px' }}
          fontWeight="700"
          color={colors.textPrimary}
          mb={3}
          lineHeight="1.3"
        >
          {article.title}
        </Heading>
        <Text
          color={colors.textSecondary}
          fontSize="14px"
          lineHeight="1.6"
          lineClamp={3}
        >
          {article.description}
        </Text>
        <Text color={colors.accent} fontSize="14px" fontWeight="600" mt={4}>
          Read more →
        </Text>
      </Box>
    </Link>
  );
}

export function BlogIndexContent({
  articles,
  categories,
  featuredArticles,
}: {
  articles: BlogArticle[];
  categories: Record<string, string>;
  featuredArticles: BlogArticle[];
}) {
  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <Nav />
      <Box as="main" flex={1} py={{ base: 16, md: 24 }}>
        <Container maxW="6xl">
          <Heading
            as="h1"
            fontSize={{ base: '32px', md: '48px' }}
            fontWeight="900"
            color={colors.textPrimary}
            letterSpacing="-0.03em"
            mb={4}
            style={anim.fadeUp('0.5s')}
          >
            Tyre Advice &amp; Guides
          </Heading>
          <Text
            fontSize="18px"
            color={colors.textSecondary}
            mb={12}
            maxW="600px"
            style={anim.fadeUp('0.5s', '0.1s')}
          >
            Expert tips from Glasgow&apos;s 24/7 mobile tyre fitters — emergency
            guides, maintenance checklists, and cost breakdowns.
          </Text>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
            {articles.map((article, index) => (
              <ArticleCard key={article.slug} article={article} index={index} />
            ))}
          </SimpleGrid>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
