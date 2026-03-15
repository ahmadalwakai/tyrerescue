'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, VStack, HStack, Badge, Button, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Recommendation {
  size: string;
  brand: string;
  action: string;
  urgency: string;
  reason: string;
  suggestedQty: number;
}

interface ForecastData {
  forecast: {
    recommendations: Recommendation[];
    summary: string;
    trend: string;
  };
  aiPowered: boolean;
}

export function InventoryForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics/forecast');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchForecast(); }, [fetchForecast]);

  if (loading) {
    return (
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <HStack justify="center" py={4}>
          <Spinner size="sm" color={c.accent} />
          <Text fontSize="sm" color={c.muted}>AI analysing inventory...</Text>
        </HStack>
      </Box>
    );
  }

  if (!data) return null;

  const urgencyColor: Record<string, string> = {
    critical: 'red',
    high: 'orange',
    medium: 'yellow',
    low: 'gray',
  };

  const actionColor: Record<string, string> = {
    reorder: 'orange',
    monitor: 'blue',
    reduce: 'green',
  };

  return (
    <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
      <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
        <Box>
          <Text color={c.text} fontWeight="600">AI Inventory Forecast</Text>
          <Text fontSize="sm" color={c.muted}>{data.forecast.summary}</Text>
        </Box>
        <HStack gap={2}>
          <Badge colorPalette={data.forecast.trend === 'growing' ? 'green' : data.forecast.trend === 'declining' ? 'red' : 'gray'} size="sm">
            {data.forecast.trend}
          </Badge>
          <Button size="xs" onClick={fetchForecast} bg={c.surface} color={c.text}>Refresh</Button>
        </HStack>
      </HStack>

      {data.forecast.recommendations.length > 0 ? (
        <VStack align="stretch" gap={0}>
          {data.forecast.recommendations.map((rec, idx) => (
            <HStack
              key={idx}
              px={4}
              py={3}
              borderBottomWidth={idx < data.forecast.recommendations.length - 1 ? '1px' : '0'}
              borderColor={c.border}
              justify="space-between"
              flexWrap="wrap"
              gap={2}
            >
              <Box>
                <HStack gap={2} mb={1}>
                  <Text fontWeight="600" color={c.text} fontSize="sm">{rec.brand} {rec.size}</Text>
                  <Badge colorPalette={urgencyColor[rec.urgency] || 'gray'} size="sm">{rec.urgency}</Badge>
                  <Badge colorPalette={actionColor[rec.action] || 'gray'} size="sm" variant="outline">{rec.action}</Badge>
                </HStack>
                <Text fontSize="xs" color={c.muted}>{rec.reason}</Text>
              </Box>
              {rec.suggestedQty > 0 && (
                <Text fontSize="sm" fontWeight="600" color={c.accent}>Order {rec.suggestedQty}</Text>
              )}
            </HStack>
          ))}
        </VStack>
      ) : (
        <Box p={4}>
          <Text fontSize="sm" color={c.muted}>No recommendations at this time</Text>
        </Box>
      )}

      {data.aiPowered && (
        <Box p={3} borderTopWidth="1px" borderColor={c.border}>
          <Text fontSize="xs" color={c.muted} textAlign="center">⚡ Powered by Groq AI</Text>
        </Box>
      )}
    </Box>
  );
}
