'use client';

import { useState, useEffect } from 'react';
import { Box, Flex, Text, Spinner, Button } from '@chakra-ui/react';
import { WizardState, BookingType } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { API } from '@/lib/api-endpoints';

const stepStyles = `
  .service-heading { font-size: 36px; }
  @media (min-width: 768px) { .service-heading { font-size: 56px; } }
  .service-card { flex-direction: column; padding: 20px; }
  @media (min-width: 768px) { .service-card { flex-direction: row; padding: 36px 40px; } }
  .service-card-title { font-size: 28px; }
  @media (min-width: 768px) { .service-card-title { font-size: 40px; } }
  .service-card-chips { flex-direction: row; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  @media (min-width: 768px) { .service-card-chips { flex-direction: column; align-items: flex-end; gap: 8px; margin-top: 0; margin-left: 24px; } }
`;

interface DriverAvailability {
  available: boolean;
  count: number;
  message: string;
}

interface StepServiceTypeProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
}

const CARDS: {
  type: BookingType;
  label: string;
  title: string;
  description: string;
}[] = [
  {
    type: 'emergency',
    label: 'EMERGENCY',
    title: 'Emergency Callout',
    description:
      'Stranded with a flat? We dispatch a driver to your exact location as quickly as possible, day or night.',
  },
  {
    type: 'scheduled',
    label: 'SCHEDULED',
    title: 'Schedule a Fitting',
    description:
      'Pick a date and time that works for you. We come to your home, workplace, or wherever you need us.',
  },
];

export function StepServiceType({
  state,
  updateState,
  goToNext,
}: StepServiceTypeProps) {
  const [availability, setAvailability] = useState<DriverAvailability | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAvailability() {
      try {
        const res = await fetch(API.DRIVER_STATUS_AVAILABLE);
        if (res.ok) {
          const data = await res.json();
          setAvailability(data);
        }
      } catch {
        setAvailability({
          available: false,
          count: 0,
          message: 'Unable to check availability',
        });
      } finally {
        setLoading(false);
      }
    }
    fetchAvailability();
  }, []);

  const selected = state.bookingType;

  const handleSelect = (type: BookingType) => {
    updateState({ bookingType: type });
  };

  return (
    <>
    <style>{stepStyles}</style>
    <Box
      minH="100vh"
      bg={c.bg}
      display="flex"
      alignItems="center"
      justifyContent="center"
      py={12}
      px={4}
    >
      <Box maxW="760px" w="full">
        {/* Heading */}
        <Text
          as="h1"
          fontFamily="var(--font-display), sans-serif"
          lineHeight={1}
          color={c.text}
          textAlign="center"
          className="service-heading"
          style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          WHAT DO YOU NEED?
        </Text>
        <Text
          fontFamily="var(--font-body), sans-serif"
          fontSize="15px"
          color={c.muted}
          textAlign="center"
          mt={3}
        >
          Choose between an immediate emergency callout or a scheduled fitting
        </Text>

        {/* Cards */}
        <Flex direction="column" gap={4} mt={12} role="radiogroup" aria-label="Service type">
          {CARDS.map((card, cardIndex) => {
            const isSelected = selected === card.type;

            return (
              <Box
                key={card.type}
                style={{ animation: `fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) ${0.1 + cardIndex * 0.1}s both` }}
              >
              <Box
                as="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => handleSelect(card.type)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(card.type);
                  }
                }}
                className="service-card"
                position="relative"
                bg={isSelected ? '#1C1917' : c.surface}
                border={isSelected ? '2px solid' : '1px solid'}
                borderColor={isSelected ? c.accent : c.border}
                borderRadius="8px"
                cursor="pointer"
                transition="all 0.15s ease"
                display="flex"
                justifyContent="space-between"
                alignItems="flex-start"
                boxShadow={isSelected
                  ? '0 0 0 4px rgba(249,115,22,0.15), inset 0 0 40px rgba(249,115,22,0.04)'
                  : 'none'}
                overflow="hidden"
                _hover={!isSelected ? { borderColor: c.accent, bg: '#1C1917' } : {}}
                w="full"
                textAlign="left"
              >
                {/* Left side */}
                <Box minW={0} flex={1}>
                  <Text
                    fontFamily="var(--font-body), sans-serif"
                    fontSize="11px"
                    fontWeight={500}
                    letterSpacing="0.15em"
                    color={c.accent}
                    textTransform="uppercase"
                  >
                    {card.label}
                  </Text>
                  <Text
                    className="service-card-title"
                    fontFamily="var(--font-display), sans-serif"
                    lineHeight={1}
                    color={c.text}
                    mt="4px"
                  >
                    {card.title}
                  </Text>
                  <Text
                    fontFamily="var(--font-body), sans-serif"
                    fontSize="14px"
                    color={c.muted}
                    mt={2}
                    maxW="440px"
                    lineHeight={1.5}
                  >
                    {card.description}
                  </Text>
                </Box>

                {/* Right side */}
                <Flex className="service-card-chips">
                  {card.type === 'emergency' ? (
                    <>
                      {loading ? (
                        <Box display="inline-flex" alignItems="center" gap={2}>
                          <Spinner size="xs" />
                          <Text
                            fontSize="12px"
                            fontWeight={500}
                            color={c.muted}
                            fontFamily="var(--font-body), sans-serif"
                          >
                            Checking...
                          </Text>
                        </Box>
                      ) : (
                        <Text
                          bg="rgba(249,115,22,0.12)"
                          border="1px solid"
                          borderColor="rgba(249,115,22,0.3)"
                          color={c.accent}
                          fontFamily="var(--font-body), sans-serif"
                          fontSize="12px"
                          fontWeight={500}
                          px={3}
                          py="4px"
                          borderRadius="4px"
                          whiteSpace="nowrap"
                        >
                          {availability?.available
                            ? 'Available Now'
                            : 'No Drivers Available'}
                        </Text>
                      )}
                      <Text
                        fontFamily="var(--font-body), sans-serif"
                        fontSize="11px"
                        color={c.muted}
                        whiteSpace="nowrap"
                      >
                        +£30 emergency surcharge
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        bg="rgba(255,255,255,0.05)"
                        border="1px solid"
                        borderColor={c.border}
                        color={c.muted}
                        fontFamily="var(--font-body), sans-serif"
                        fontSize="12px"
                        fontWeight={500}
                        px={3}
                        py="4px"
                        borderRadius="4px"
                        whiteSpace="nowrap"
                      >
                        Up to 14 days ahead
                      </Text>
                      <Text
                        fontFamily="var(--font-body), sans-serif"
                        fontSize="11px"
                        color={c.muted}
                        whiteSpace="nowrap"
                      >
                        No emergency surcharge
                      </Text>
                    </>
                  )}
                </Flex>

                {/* Selection indicator bar */}
                <Box
                  position="absolute"
                  right={0}
                  top={0}
                  w="3px"
                  h="full"
                  borderRadius="0 8px 8px 0"
                  bg={isSelected ? c.accent : 'transparent'}
                  transition="background 0.15s"
                />
              </Box>
              </Box>
            );
          })}
        </Flex>

        {/* Help text */}
        <Text
          fontFamily="var(--font-body), sans-serif"
          fontSize="13px"
          color={c.muted}
          textAlign="center"
          mt={8}
        >
          Not sure? Call us on{' '}
          <a href="tel:01412660690" style={{ color: c.text, fontWeight: 500, textDecoration: 'none' }}>
            0141 266 0690
          </a>
        </Text>

        {/* Continue button */}
        {selected && (
          <Button
            onClick={goToNext}
            w="full"
            h="52px"
            bg={c.accent}
            color={c.bg}
            fontFamily="var(--font-display), sans-serif"
            fontSize="22px"
            letterSpacing="0.05em"
            borderRadius="6px"
            mt={6}
            _hover={{ bg: c.accentHover }}
            style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}
          >
            CONTINUE {'\u2192'}
          </Button>
        )}

      </Box>
    </Box>
    </>
  );
}
