'use client';

import { memo, useState } from 'react';
import Image from 'next/image';
import { Box, Flex, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { homeSlides, type HomeSlide } from './homeImageSlides';
import { useAutoplaySlides } from './useAutoplaySlides';

/* ── Tokens ──────────────────────────────────────────────── */
const c = colorTokens;
const RADIUS = '24px';
const TRANSITION_MS = 500; // fade + scale duration
const AUTOPLAY_MS = 5000;

/* ── Badge chip data ─────────────────────────────────────── */
const badges = [
  { label: '24/7 Callout', top: '16px', left: '16px' },
  { label: 'Mobile Fitting', top: '16px', right: '16px' },
  { label: 'Glasgow & Edinburgh', bottom: '72px', left: '16px' },
] as const;

/* ── Component ───────────────────────────────────────────── */

interface HomeImageShowcaseProps {
  /** Override slides (for testing). Defaults to homeSlides */
  slides?: HomeSlide[];
}

function HomeImageShowcaseInner({ slides = homeSlides }: HomeImageShowcaseProps) {
  const { activeIndex, goTo, pause, resume } = useAutoplaySlides({
    count: slides.length,
    interval: AUTOPLAY_MS,
  });

  // Track image load errors for graceful fallback
  const [errors, setErrors] = useState<Set<string>>(() => new Set());

  if (slides.length === 0) return null;

  return (
    <Box
      position="relative"
      w="100%"
      minH={{ base: '320px', md: '440px', lg: '580px' }}
      borderRadius={RADIUS}
      overflow="hidden"
      borderWidth="1px"
      borderColor="rgba(249,115,22,0.3)"
      bg={c.card}
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        boxShadow: `0 0 40px rgba(249,115,22,0.08), 0 2px 16px rgba(0,0,0,0.4)`,
      }}
    >
      {/* ── Slides ─────────────────────────────────────── */}
      {slides.map((slide, i) => {
        const isActive = i === activeIndex;
        const hasError = errors.has(slide.id);

        return (
          <Box
            key={slide.id}
            position="absolute"
            inset={0}
            style={{
              opacity: isActive ? 1 : 0,
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              transition: `opacity ${TRANSITION_MS}ms ease-in-out, transform ${TRANSITION_MS * 6}ms ease-out`,
              zIndex: isActive ? 1 : 0,
              pointerEvents: isActive ? 'auto' : 'none',
            }}
          >
            {hasError ? (
              /* Graceful fallback when image is missing */
              <Box
                position="absolute"
                inset={0}
                bg={c.card}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="13px" color={c.muted} textAlign="center" px={8}>
                  {slide.alt}
                </Text>
              </Box>
            ) : (
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 45vw"
                priority={slide.priority}
                quality={80}
                style={{
                  objectFit: 'cover',
                  objectPosition: slide.objectPosition,
                }}
                onError={() =>
                  setErrors((prev) => new Set(prev).add(slide.id))
                }
              />
            )}
          </Box>
        );
      })}

      {/* ── Bottom gradient overlay ────────────────────── */}
      <Box
        position="absolute"
        inset={0}
        zIndex={2}
        pointerEvents="none"
        style={{
          background:
            'linear-gradient(to top, rgba(9,9,11,0.85) 0%, rgba(9,9,11,0.4) 35%, transparent 65%)',
        }}
      />

      {/* ── Slide text overlay ─────────────────────────── */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        p={{ base: '20px', md: '28px' }}
        zIndex={3}
      >
        {slides[activeIndex] && (
          <>
            <Text
              fontSize="10px"
              letterSpacing="0.2em"
              color={c.accent}
              mb={1}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {slides[activeIndex].eyebrow}
            </Text>
            <Text
              fontSize={{ base: '22px', md: '28px' }}
              color={c.text}
              lineHeight="1.1"
              mb={1}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {slides[activeIndex].title}
            </Text>
            {slides[activeIndex].caption && (
              <Text fontSize="13px" color={c.muted}>
                {slides[activeIndex].caption}
              </Text>
            )}
          </>
        )}

        {/* ── Progress dots ──────────────────────────── */}
        {slides.length > 1 && (
          <Flex gap="8px" mt="14px" role="tablist" aria-label="Image slides">
            {slides.map((slide, i) => (
              <Box
                key={slide.id}
                as="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Go to slide ${i + 1}: ${slide.alt}`}
                w="28px"
                h="3px"
                borderRadius="2px"
                bg={i === activeIndex ? c.accent : 'rgba(255,255,255,0.25)'}
                cursor="pointer"
                transition="background 0.3s"
                _hover={{ bg: i === activeIndex ? c.accent : 'rgba(255,255,255,0.45)' }}
                onClick={() => goTo(i)}
              />
            ))}
          </Flex>
        )}
      </Box>

      {/* ── Floating badge chips ───────────────────────── */}
      {badges.map((badge) => (
        <Box
          key={badge.label}
          position="absolute"
          zIndex={3}
          top={'top' in badge ? badge.top : undefined}
          bottom={'bottom' in badge ? badge.bottom : undefined}
          left={'left' in badge ? badge.left : undefined}
          right={'right' in badge ? badge.right : undefined}
          bg="rgba(9,9,11,0.7)"
          backdropFilter="blur(8px)"
          borderWidth="1px"
          borderColor="rgba(249,115,22,0.25)"
          borderRadius="6px"
          px="10px"
          py="4px"
          display={{ base: 'none', md: 'block' }}
          style={{
            animation: 'fadeUp 0.5s ease-out 0.8s both',
          }}
        >
          <Text fontSize="10px" letterSpacing="0.15em" color={c.text} style={{ fontFamily: 'var(--font-body)' }}>
            {badge.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export const HomeImageShowcase = memo(HomeImageShowcaseInner);
