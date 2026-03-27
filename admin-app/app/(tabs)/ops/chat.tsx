import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type Conversation = {
  id: string;
  bookingRef: string | null;
  channel: string;
  status: string;
  unreadCount: number;
};

type ConversationListResponse = {
  conversations: Conversation[];
};

type ConversationDetailResponse = {
  conversation: { id: string; status: string; channel: string };
  messages: Array<{ id: string; body: string | null; senderRole: string; createdAt: string }>;
};

export default function ChatScreen() {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messageBody, setMessageBody] = useState('');

  const listQuery = useQuery<ConversationListResponse>({
    queryKey: ['chat-conversations'],
    queryFn: () => apiClient.get('/api/chat/conversations?status=open'),
    refetchInterval: 15000,
  });

  const detailQuery = useQuery<ConversationDetailResponse>({
    queryKey: ['chat-conversation', selectedConversationId],
    queryFn: () => apiClient.get(`/api/chat/conversations/${selectedConversationId}`),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 12000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/chat/conversations/${selectedConversationId}/messages`, {
        body: messageBody,
        messageType: 'text',
      }),
    onSuccess: () => {
      setMessageBody('');
      queryClient.invalidateQueries({ queryKey: ['chat-conversation', selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const currentConversation = useMemo(
    () => listQuery.data?.conversations?.find((item) => item.id === selectedConversationId),
    [listQuery.data, selectedConversationId],
  );

  return (
    <Screen>
      <Text style={styles.title}>Booking chat</Text>
      <Text style={styles.subtitle}>Open conversations with customers and drivers</Text>

      <StateView
        loading={listQuery.isLoading}
        error={listQuery.error instanceof Error ? listQuery.error.message : null}
        empty={!listQuery.data?.conversations?.length}
        emptyLabel="No open conversations"
      />

      {listQuery.data?.conversations?.map((conversation) => (
        <Card key={conversation.id}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Conversation {conversation.id.slice(0, 8)}</Text>
              <Text style={styles.meta}>Booking: {conversation.bookingRef || 'N/A'}</Text>
              <Text style={styles.meta}>Channel: {conversation.channel}</Text>
            </View>
            <StatusChip status={conversation.status} />
          </View>
          <PrimaryButton title="Open" onPress={() => setSelectedConversationId(conversation.id)} />
        </Card>
      ))}

      {selectedConversationId ? (
        <Card>
          <Text style={styles.sectionTitle}>Conversation detail</Text>
          <Text style={styles.meta}>ID: {selectedConversationId}</Text>
          <Text style={styles.meta}>Status: {currentConversation?.status || detailQuery.data?.conversation?.status || '-'}</Text>

          <StateView
            loading={detailQuery.isLoading}
            error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
            empty={!detailQuery.data?.messages?.length}
            emptyLabel="No messages yet"
          />

          {detailQuery.data?.messages?.slice(-8).map((message) => (
            <View key={message.id} style={styles.messageRow}>
              <Text style={styles.messageRole}>{message.senderRole}</Text>
              <Text style={styles.meta}>{message.body || '[attachment]'}</Text>
            </View>
          ))}

          <InputField label="Reply" value={messageBody} onChangeText={setMessageBody} placeholder="Type a response" />
          <PrimaryButton
            title={sendMutation.isPending ? 'Sending...' : 'Send'}
            onPress={() => sendMutation.mutate()}
            disabled={!messageBody || sendMutation.isPending}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 3,
    marginBottom: 10,
    color: colors.textMuted,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  messageRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  messageRole: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
