import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { StateView } from '@/ui/StateView';
import { colors } from '@/ui/theme';

type SeoPayload = {
  latest: {
    performanceScore?: number | null;
    accessibilityScore?: number | null;
    bestPracticesScore?: number | null;
    seoScore?: number | null;
  } | null;
  summary: {
    totalPagesAnalysed: number;
    pagesWithIssues: number;
  };
  pages: Array<{ path: string; lastCrawled: string | null }>;
};

export default function SeoScreen() {
  const { data, isLoading, error } = useQuery<SeoPayload>({
    queryKey: ['insights-seo'],
    queryFn: () => apiClient.get('/api/mobile/admin/seo'),
  });

  return (
    <Screen>
      <Text style={styles.title}>SEO health</Text>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.section}>Latest scorecard</Text>
            <Text style={styles.value}>Performance: {data.latest?.performanceScore ?? '-'}</Text>
            <Text style={styles.value}>Accessibility: {data.latest?.accessibilityScore ?? '-'}</Text>
            <Text style={styles.value}>Best practices: {data.latest?.bestPracticesScore ?? '-'}</Text>
            <Text style={styles.value}>SEO: {data.latest?.seoScore ?? '-'}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Crawl summary</Text>
            <Text style={styles.value}>Analysed pages: {data.summary.totalPagesAnalysed}</Text>
            <Text style={styles.value}>Pages with issues: {data.summary.pagesWithIssues}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Recent pages</Text>
            {data.pages.slice(0, 12).map((page) => (
              <Text key={page.path} style={styles.value}>{page.path}</Text>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  value: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
});
