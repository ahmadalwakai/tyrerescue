import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  active: boolean;
};

type FaqResponse = {
  items: FaqItem[];
};

export default function FaqScreen() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const { data, isLoading, error } = useQuery<FaqResponse>({
    queryKey: ['cms-faq'],
    queryFn: () => apiClient.get('/api/mobile/admin/faq'),
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/api/mobile/admin/faq', { question, answer }),
    onSuccess: () => {
      setQuestion('');
      setAnswer('');
      queryClient.invalidateQueries({ queryKey: ['cms-faq'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiClient.patch('/api/mobile/admin/faq', { id, active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-faq'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>FAQ management</Text>

      <Card>
        <InputField label="Question" value={question} onChangeText={setQuestion} />
        <InputField label="Answer" value={answer} onChangeText={setAnswer} />
        <PrimaryButton
          title={createMutation.isPending ? 'Creating...' : 'Create FAQ'}
          onPress={() => createMutation.mutate()}
          disabled={!question || !answer || createMutation.isPending}
        />
      </Card>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No FAQs"
      />

      {data?.items?.map((item) => (
        <Card key={item.id}>
          <Text style={styles.question}>{item.question}</Text>
          <Text style={styles.answer}>{item.answer}</Text>
          <StatusPill label={item.active ? 'active' : 'inactive'} />
          <PrimaryButton
            title={item.active ? 'Deactivate' : 'Activate'}
            tone="neutral"
            onPress={() => toggleMutation.mutate({ id: item.id, active: !item.active })}
            disabled={toggleMutation.isPending}
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
  question: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  answer: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 12,
  },
});
