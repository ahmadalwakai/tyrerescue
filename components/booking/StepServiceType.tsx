'use client';

import { useState, useEffect } from 'react';
import { Box, Text, Spinner } from '@chakra-ui/react';
import { WizardState, BookingType } from './types';

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
        const res = await fetch('/api/driver/status/available');
        if (res.ok) {
          const data = await res.json();
          setAvailability(data);
        }
      } catch (e) {
        console.error('Failed to fetch driver availability:', e);
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
    <div
      style={{
        minHeight: '100vh',
        background: '#09090B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
      }}
    >
      <div style={{ maxWidth: 760, width: '100%' }}>
        {/* Heading */}
        <h1
          style={{
            fontFamily: 'var(--font-display), sans-serif',
            lineHeight: 1,
            color: '#FAFAFA',
            textAlign: 'center',
            margin: 0,
            animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
          }}
          className="service-heading"
        >
          WHAT DO YOU NEED?
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: 15,
            color: '#A1A1AA',
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          Choose between an immediate emergency callout or a scheduled fitting
        </p>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 48 }}>
          {CARDS.map((card, cardIndex) => {
            const isSelected = selected === card.type;

            return (
              <div
                key={card.type}
                style={{ animation: `fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) ${0.1 + cardIndex * 0.1}s both` }}
              >
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(card.type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(card.type);
                  }
                }}
                className="service-card"
                style={{
                  position: 'relative',
                  background: isSelected ? '#1C1917' : '#18181B',
                  border: isSelected
                    ? '2px solid #F97316'
                    : '1px solid #3F3F46',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  boxShadow: isSelected
                    ? '0 0 0 4px rgba(249,115,22,0.15), inset 0 0 40px rgba(249,115,22,0.04)'
                    : 'none',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#F97316';
                    e.currentTarget.style.background = '#1C1917';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#3F3F46';
                    e.currentTarget.style.background = '#18181B';
                  }
                }}
              >
                {/* Left side */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-body), sans-serif',
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.15em',
                      color: '#F97316',
                      textTransform: 'uppercase' as const,
                    }}
                  >
                    {card.label}
                  </span>
                  <div
                    className="service-card-title"
                    style={{
                      fontFamily: 'var(--font-display), sans-serif',
                      lineHeight: 1,
                      color: '#FAFAFA',
                      marginTop: 4,
                    }}
                  >
                    {card.title}
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-body), sans-serif',
                      fontSize: 14,
                      color: '#A1A1AA',
                      marginTop: 8,
                      maxWidth: 440,
                      lineHeight: 1.5,
                    }}
                  >
                    {card.description}
                  </p>
                </div>

                {/* Right side */}
                <div className="service-card-chips">
                  {card.type === 'emergency' ? (
                    <>
                      {loading ? (
                        <Box display="inline-flex" alignItems="center" gap={2}>
                          <Spinner size="xs" />
                          <Text
                            fontSize="12px"
                            fontWeight={500}
                            color="#A1A1AA"
                            fontFamily="var(--font-body), sans-serif"
                          >
                            Checking...
                          </Text>
                        </Box>
                      ) : (
                        <span
                          style={{
                            background: 'rgba(249,115,22,0.12)',
                            border: '1px solid rgba(249,115,22,0.3)',
                            color: '#F97316',
                            fontFamily: 'var(--font-body), sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '4px 12px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {availability?.available
                            ? 'Available Now'
                            : 'No Drivers Available'}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--font-body), sans-serif',
                          fontSize: 11,
                          color: '#A1A1AA',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        +£30 emergency surcharge
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid #3F3F46',
                          color: '#A1A1AA',
                          fontFamily: 'var(--font-body), sans-serif',
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '4px 12px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Up to 14 days ahead
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-body), sans-serif',
                          fontSize: 11,
                          color: '#A1A1AA',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        No emergency surcharge
                      </span>
                    </>
                  )}
                </div>

                {/* Selection indicator bar */}
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    width: 3,
                    height: '100%',
                    borderRadius: '0 8px 8px 0',
                    background: isSelected ? '#F97316' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                />
              </div>
              </div>
            );
          })}
        </div>

        {/* Help text */}
        <p
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: 13,
            color: '#A1A1AA',
            textAlign: 'center',
            marginTop: 32,
          }}
        >
          Not sure? Call us on{' '}
          <a
            href="tel:01412660690"
            style={{
              color: '#FAFAFA',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            0141 266 0690
          </a>
        </p>

        {/* Continue button */}
        {selected && (
          <button
            type="button"
            onClick={goToNext}
            style={{
              width: '100%',
              height: 52,
              background: '#F97316',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'var(--font-display), sans-serif',
              fontSize: 22,
              letterSpacing: '0.05em',
              color: '#09090B',
              cursor: 'pointer',
              marginTop: 24,
              animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#EA580C';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F97316';
            }}
          >
            CONTINUE →
          </button>
        )}


      </div>
    </div>
    </>
  );
}
