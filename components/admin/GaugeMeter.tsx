'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { motion } from 'motion/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface GaugeMeterProps {
  value: number;
  max: number;
  label: string;
  color: string;
  icon: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}

const MotionBox = motion.create(Box);

export function GaugeMeter({ value, max, label, color, icon, trend, trendValue }: GaugeMeterProps) {
  const pct = Math.min((value / max) * 100, 100);
  const angle = (pct / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const needleX = 50 + 35 * Math.cos(Math.PI - rad);
  const needleY = 50 - 35 * Math.sin(Math.PI - rad);

  return (
    <MotionBox
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      bg={c.surface}
      borderRadius="16px"
      p="20px 16px 14px"
      border={`1px solid ${c.border}`}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="3px"
        bg={`linear-gradient(90deg, transparent, ${color}, transparent)`}
        opacity={0.6}
      />
      <Flex align="center" gap={2} mb={2}>
        <Text fontSize="18px">{icon}</Text>
        <Text fontSize="11px" color={c.muted} textTransform="uppercase" letterSpacing="1.5px" fontFamily="monospace">
          {label}
        </Text>
      </Flex>

      <Box w="100%" maxW="200px" mx="auto" display="block">
        <svg viewBox="0 0 100 55" width="100%" style={{ display: 'block' }}>
        <defs>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={c.card} strokeWidth="7" strokeLinecap="round" />
        <motion.path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${pct * 1.26} 126`}
          initial={{ strokeDasharray: '0 126' }}
          animate={{ strokeDasharray: `${pct * 1.26} 126` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <motion.circle
          cx={needleX}
          cy={needleY}
          r="3"
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          filter={`url(#glow-${label})`}
        />
        </svg>
      </Box>

      <Box textAlign="center" mt="-4px">
        <MotionBox
          as="span"
          fontSize="28px"
          fontWeight="700"
          color={c.text}
          fontFamily="monospace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {value.toLocaleString()}
        </MotionBox>
      </Box>

      {trend && trendValue && (
        <Box textAlign="center" mt={1}>
          <Text
            as="span"
            fontSize="11px"
            fontWeight="600"
            color={trend === 'up' ? '#10b981' : '#ef4444'}
            fontFamily="monospace"
          >
            {trend === 'up' ? '▲' : '▼'} {trendValue}%
          </Text>
          <Text as="span" fontSize="10px" color={c.muted} ml={1}>
            vs last period
          </Text>
        </Box>
      )}
    </MotionBox>
  );
}
