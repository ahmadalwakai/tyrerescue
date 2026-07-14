'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Box, Flex, Link as ChakraLink } from '@chakra-ui/react';
import { trackCallClick, trackWhatsAppClick } from '@/lib/analytics/gtag';
import { WhatsAppQuickHelpSheet } from '@/components/ui/WhatsAppQuickHelpSheet';
import {
  buildWhatsAppHref,
  DEFAULT_WHATSAPP_PHONE,
  FALLBACK_WHATSAPP_MESSAGE,
} from '@/lib/contact/whatsapp-options';

const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER || '0141 266 0690';
const PHONE_TEL = PHONE_NUMBER.replace(/\s/g, '');
const WHATSAPP_PHONE = DEFAULT_WHATSAPP_PHONE;
// Href fallback used when JavaScript fails: still opens WhatsApp directly
// with a safe default message, matching prior behaviour.
const WHATSAPP_URL = buildWhatsAppHref(FALLBACK_WHATSAPP_MESSAGE, WHATSAPP_PHONE);

const HIDDEN_ROUTES = ['/emergency'];
const HIDDEN_PREFIXES = ['/admin', '/dashboard', '/driver', '/emergency-tyre-fitting', '/puncture-repair'];

/* ─── Inline SVG Icons ──────────────────────────────────── */

function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.174-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

/* ─── Unified Floating Action Stack ─────────────────────── */

export function FloatingContactBar() {
  const pathname = usePathname();
  const [showTop, setShowTop] = useState(false);
  const [sheetOpenPath, setSheetOpenPath] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (HIDDEN_ROUTES.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const openSheet = (label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Preserve href fallback for no-JS / blocked popups: only intercept when
    // we can actually open the sheet. Modifier keys / middle-click bypass.
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    trackWhatsAppClick(label);
    setSheetOpenPath(pathname);
  };

  return (
    <>
      {/* ── Desktop floating dock ─────────────────────── */}
      <Box
        position="fixed"
        bottom="24px"
        right="24px"
        zIndex={50}
        display={{ base: 'none', md: 'block' }}
        className="floating-action-stack"
      >
        <Flex direction="column" align="flex-end" gap="10px">
          {/* Scroll-to-top — secondary, above dock */}
          <Box
            as="button"
            className="floating-top-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            w="36px"
            h="36px"
            borderRadius="10px"
            bg="rgba(24,24,27,0.85)"
            color="#A1A1AA"
            display="flex"
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            border="1px solid rgba(63,63,70,0.6)"
            opacity={showTop ? 1 : 0}
            pointerEvents={showTop ? 'auto' : 'none'}
            transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
            transform={showTop ? 'translateY(0)' : 'translateY(8px)'}
            _hover={{
              bg: 'rgba(39,39,42,0.95)',
              color: '#F97316',
              borderColor: 'rgba(249,115,22,0.3)',
            }}
            aria-label="Back to top"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          >
            <ChevronUpIcon />
          </Box>

          {/* Contact dock — glass pill */}
          <Flex
            gap="6px"
            align="center"
            bg="rgba(24,24,27,0.8)"
            borderRadius="16px"
            border="1px solid rgba(63,63,70,0.5)"
            p="5px"
            boxShadow="0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          >
            <ChakraLink
              href={`tel:${PHONE_TEL}`}
              className="floating-call-btn"
              onClick={() => trackCallClick('floating_desktop')}
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap="7px"
              h="42px"
              px="14px"
              bg="linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
              color="white"
              borderRadius="12px"
              fontSize="13px"
              fontWeight="700"
              letterSpacing="0.01em"
              transition="all 0.25s cubic-bezier(0.4,0,0.2,1)"
              _hover={{
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 20px rgba(249,115,22,0.45)',
              }}
              _active={{ transform: 'scale(0.97)' }}
              aria-label={`Call ${PHONE_NUMBER}`}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <PhoneIcon size={16} />
              {PHONE_NUMBER}
            </ChakraLink>
            <ChakraLink
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="floating-wa-btn"
              onClick={openSheet('floating_desktop')}
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap="7px"
              h="42px"
              px="14px"
              bg="linear-gradient(135deg, #25D366 0%, #1DA851 100%)"
              color="white"
              borderRadius="12px"
              fontSize="13px"
              fontWeight="700"
              letterSpacing="0.01em"
              transition="all 0.25s cubic-bezier(0.4,0,0.2,1)"
              _hover={{
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 20px rgba(37,211,102,0.4)',
              }}
              _active={{ transform: 'scale(0.97)' }}
              aria-label="WhatsApp us"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <WhatsAppIcon size={16} />
              WhatsApp
            </ChakraLink>
          </Flex>
        </Flex>
      </Box>

      {/* ── Mobile scroll-to-top (floats above sticky bar) ─ */}
      <Box
        as="button"
        className="floating-top-btn sticky-cta-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        display={{ base: 'flex', md: 'none' }}
        position="fixed"
        right="14px"
        zIndex={49}
        w="40px"
        h="40px"
        borderRadius="12px"
        bg="rgba(24,24,27,0.9)"
        color="#A1A1AA"
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        border="1px solid rgba(63,63,70,0.5)"
        boxShadow="0 4px 16px rgba(0,0,0,0.35)"
        opacity={showTop ? 1 : 0}
        pointerEvents={showTop ? 'auto' : 'none'}
        transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
        transform={showTop ? 'translateY(0)' : 'translateY(8px)'}
        _active={{ transform: 'scale(0.9)' }}
        aria-label="Back to top"
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
        }}
      >
        <ChevronUpIcon />
      </Box>

      {/* ── Mobile sticky bottom CTA bar ──────────────── */}
      <Box
        display={{ base: 'block', md: 'none' }}
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={50}
        className="sticky-cta-bar"
        bg="rgba(9,9,11,0.92)"
        borderTop="1px solid rgba(63,63,70,0.5)"
        boxShadow="0 -8px 32px rgba(0,0,0,0.45)"
        style={{
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <Flex
          gap="10px"
          align="center"
          px="12px"
          py="10px"
        >
          <ChakraLink
            href={`tel:${PHONE_TEL}`}
            className="floating-call-btn"
            onClick={() => trackCallClick('sticky_mobile')}
            flex="1"
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap="10px"
            h="56px"
            bg="linear-gradient(135deg, #f97316 0%, #c2410c 100%)"
            color="white"
            borderRadius="14px"
            fontSize="18px"
            fontWeight="900"
            letterSpacing="0.05em"
            transition="all 0.2s cubic-bezier(0.4,0,0.2,1)"
            _active={{ transform: 'scale(0.97)' }}
            aria-label={`Call ${PHONE_NUMBER}`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <PhoneIcon size={22} />
            Call Now
          </ChakraLink>

          <ChakraLink
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="floating-wa-btn"
            onClick={openSheet('sticky_mobile')}
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="56px"
            h="56px"
            flexShrink={0}
            bg="linear-gradient(135deg, #25D366 0%, #1DA851 100%)"
            color="white"
            borderRadius="14px"
            transition="all 0.2s cubic-bezier(0.4,0,0.2,1)"
            _active={{ transform: 'scale(0.92)' }}
            aria-label="WhatsApp us"
          >
            <WhatsAppIcon size={24} />
          </ChakraLink>
        </Flex>
      </Box>

      {/* WhatsApp Quick Help Sheet — replaces the immediate WhatsApp open
          on click. The plain links above remain as a no-JS fallback. */}
      <WhatsAppQuickHelpSheet
        open={sheetOpenPath === pathname}
        onClose={() => setSheetOpenPath(null)}
        phoneNumber={PHONE_NUMBER}
        whatsappPhone={WHATSAPP_PHONE}
      />
    </>
  );
}
