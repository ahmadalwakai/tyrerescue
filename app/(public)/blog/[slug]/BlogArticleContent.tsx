'use client';

import Link from 'next/link';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
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

/** Converts the markdown-like content string to HTML */
function markdownToHtml(md: string): string {
  let html = md
    // Headings (### before ##)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Tables
    .replace(
      /(?:^\|.+\|$\n?)+/gm,
      (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter((r) => !/^\|[\s-|]+\|$/.test(r));
        if (rows.length === 0) return '';
        const parseRow = (row: string) =>
          row
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
        const headerCells = parseRow(rows[0]);
        const bodyRows = rows.slice(1);
        return `<table><thead><tr>${headerCells.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${parseRow(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      },
    )
    // Unordered lists
    .replace(
      /(?:^- .+$\n?)+/gm,
      (listBlock) => {
        const items = listBlock.trim().split('\n').map((l) => l.replace(/^- /, ''));
        return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
      },
    )
    // Ordered lists
    .replace(
      /(?:^\d+\. .+$\n?)+/gm,
      (listBlock) => {
        const items = listBlock.trim().split('\n').map((l) => l.replace(/^\d+\. /, ''));
        return `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
      },
    )
    // Paragraphs: wrap remaining non-empty, non-tag lines
    .replace(/^(?!<[a-z]).+$/gm, (line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return `<p>${trimmed}</p>`;
    });

  // Clean up empty lines
  html = html.replace(/\n{2,}/g, '\n');

  return html;
}

export function BlogArticleContent({
  article,
  relatedArticles,
}: {
  article: BlogArticle;
  relatedArticles: BlogArticle[];
}) {
  const contentHtml = markdownToHtml(article.content);

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <Nav />
      <Box as="main" flex={1} py={{ base: 16, md: 24 }}>
        <Container maxW="4xl">
          {/* Breadcrumb */}
          <Flex gap={2} mb={6} fontSize="13px" style={anim.fadeUp('0.3s')}>
            <Link href="/" style={{ color: colors.textSecondary, textDecoration: 'none' }}>
              Home
            </Link>
            <Text color={colors.textSecondary}>/</Text>
            <Link href="/blog" style={{ color: colors.textSecondary, textDecoration: 'none' }}>
              Blog
            </Link>
            <Text color={colors.textSecondary}>/</Text>
            <Text color={colors.accent} lineClamp={1}>
              {article.title}
            </Text>
          </Flex>

          {/* Meta */}
          <Flex gap={3} align="center" mb={4} style={anim.fadeUp('0.4s', '0.05s')}>
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
            <Text color={colors.textSecondary} fontSize="13px">
              {article.readingTime} min read
            </Text>
            <Text color={colors.textSecondary} fontSize="13px">
              {new Date(article.publishDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </Flex>

          {/* Title */}
          <Heading
            as="h1"
            fontSize={{ base: '28px', md: '40px' }}
            fontWeight="900"
            color={colors.textPrimary}
            letterSpacing="-0.03em"
            lineHeight="1.15"
            mb={4}
            style={anim.fadeUp('0.5s', '0.1s')}
          >
            {article.title}
          </Heading>

          <Text
            fontSize="18px"
            color={colors.textSecondary}
            mb={10}
            maxW="640px"
            lineHeight="1.6"
            style={anim.fadeUp('0.5s', '0.15s')}
          >
            {article.description}
          </Text>

          {/* Article body */}
          <Box
            className="blog-prose"
            style={anim.fadeUp('0.6s', '0.2s')}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
          <style>{`
            .blog-prose h2 {
              font-size: 28px;
              font-weight: 800;
              color: ${colors.textPrimary};
              margin-top: 2.5rem;
              margin-bottom: 1rem;
              letter-spacing: -0.02em;
            }
            .blog-prose h3 {
              font-size: 22px;
              font-weight: 700;
              color: ${colors.textPrimary};
              margin-top: 2rem;
              margin-bottom: 0.75rem;
            }
            .blog-prose p {
              color: ${colors.textSecondary};
              font-size: 16px;
              line-height: 1.75;
              margin-bottom: 1rem;
            }
            .blog-prose strong {
              color: ${colors.textPrimary};
              font-weight: 600;
            }
            .blog-prose ul, .blog-prose ol {
              padding-left: 1.5rem;
              margin-bottom: 1rem;
            }
            .blog-prose li {
              color: ${colors.textSecondary};
              font-size: 16px;
              line-height: 1.75;
              margin-bottom: 0.25rem;
            }
            .blog-prose table {
              width: 100%;
              margin-bottom: 1.5rem;
              border-collapse: collapse;
            }
            .blog-prose th {
              background: ${colors.surface};
              color: ${colors.textPrimary};
              font-weight: 600;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 0.75rem;
              border-bottom: 1px solid ${colors.border};
              text-align: left;
            }
            .blog-prose td {
              color: ${colors.textSecondary};
              font-size: 14px;
              padding: 0.75rem;
              border-bottom: 1px solid ${colors.border};
            }
            @media (max-width: 768px) {
              .blog-prose h2 { font-size: 22px; }
              .blog-prose h3 { font-size: 18px; }
            }
          `}</style>

          {/* CTA */}
          <Box
            mt={12}
            p={8}
            bg={colors.surface}
            borderRadius="12px"
            border="1px solid"
            borderColor={colors.border}
            textAlign="center"
          >
            <Heading as="h2" fontSize="24px" fontWeight="800" color={colors.textPrimary} mb={3}>
              Need a Tyre Fitted Now?
            </Heading>
            <Text color={colors.textSecondary} mb={5} fontSize="16px">
              24/7 mobile tyre fitting across Glasgow &amp; Edinburgh — average
              45-minute response.
            </Text>
            <Flex gap={4} justify="center" wrap="wrap">
              <Link
                href="tel:+441412660690"
                style={{
                  display: 'inline-block',
                  background: colors.accent,
                  color: 'white',
                  padding: '12px 28px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '16px',
                  textDecoration: 'none',
                }}
              >
                Call 0141 266 0690
              </Link>
              <Link
                href="/book"
                style={{
                  display: 'inline-block',
                  background: 'transparent',
                  color: colors.accent,
                  padding: '12px 28px',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '16px',
                  textDecoration: 'none',
                  border: `1px solid ${colors.accent}`,
                }}
              >
                Book Online
              </Link>
            </Flex>
          </Box>

          {/* Related articles */}
          {relatedArticles.length > 0 && (
            <Box mt={16}>
              <Heading as="h2" fontSize="24px" fontWeight="800" color={colors.textPrimary} mb={6}>
                Related Articles
              </Heading>
              <Flex gap={4} direction={{ base: 'column', md: 'row' }}>
                {relatedArticles.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    style={{ textDecoration: 'none', flex: 1 }}
                  >
                    <Box
                      bg={colors.surface}
                      borderRadius="10px"
                      border="1px solid"
                      borderColor={colors.border}
                      p={5}
                      transition="border-color 0.2s ease"
                      _hover={{ borderColor: colors.accent }}
                    >
                      <Badge
                        bg={categoryColors[related.category] ?? colors.accent}
                        color="white"
                        fontSize="10px"
                        px={2}
                        py={0.5}
                        borderRadius="4px"
                        fontWeight="600"
                        textTransform="uppercase"
                        mb={2}
                      >
                        {related.category}
                      </Badge>
                      <Text fontWeight="700" color={colors.textPrimary} fontSize="15px" mb={2}>
                        {related.title}
                      </Text>
                      <Text color={colors.textSecondary} fontSize="13px" lineClamp={2}>
                        {related.description}
                      </Text>
                    </Box>
                  </Link>
                ))}
              </Flex>
            </Box>
          )}
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
