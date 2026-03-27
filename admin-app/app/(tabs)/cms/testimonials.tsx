import { StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type Testimonial = {
  id: string;
  authorName: string;
  content: string;
  featured: boolean;
  approved: boolean;
};

type TestimonialsResponse = {
  items: Testimonial[];
};

export default function TestimonialsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<TestimonialsResponse>({
    queryKey: ['cms-testimonials'],
    queryFn: () => apiClient.get('/api/mobile/admin/testimonials'),
  });

  const mutation = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      apiClient.patch('/api/mobile/admin/testimonials', { id, featured }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-testimonials'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Testimonials</Text>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No testimonials"
      />

      {data?.items?.map((item) => (
        <Card key={item.id}>
          <Text style={styles.author}>{item.authorName}</Text>
          <Text style={styles.body}>{item.content}</Text>
          <StatusPill label={item.featured ? 'featured' : 'standard'} />
          <PrimaryButton
            title={item.featured ? 'Unfeature' : 'Feature'}
            onPress={() => mutation.mutate({ id: item.id, featured: !item.featured })}
            disabled={mutation.isPending}
          />
        </Card>
      ))}
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
  author: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  body: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
});
