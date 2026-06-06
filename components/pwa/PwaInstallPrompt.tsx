'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, CloseButton, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { getConsent } from '@/components/ui/CookieBanner';
import { colorTokens as c } from '@/lib/design-tokens';

type InstallMode = 'native' | 'ios';
type InstallPromptChoice = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: InstallPromptChoice;
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

const SNOOZE_KEY = 'tyrerescue_install_prompt_snoozed_until';
const INSTALLED_KEY = 'tyrerescue_install_prompt_installed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1800;
const SW_PATH = '/sw.js';

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const touchMac = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

function canUseLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.getItem(SNOOZE_KEY);
    return true;
  } catch {
    return false;
  }
}

function isSnoozed(): boolean {
  if (!canUseLocalStorage()) return false;
  const raw = window.localStorage.getItem(SNOOZE_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

function hasInstalledFlag(): boolean {
  if (!canUseLocalStorage()) return false;
  return window.localStorage.getItem(INSTALLED_KEY) === 'true';
}

function snoozePrompt(): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
}

function markInstalled(): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(INSTALLED_KEY, 'true');
  window.localStorage.removeItem(SNOOZE_KEY);
}

async function registerPwaServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  } catch (error) {
    console.warn('[PWA] Service worker registration failed:', error);
  }
}

function InstallIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M12 7v7" />
      <path d="m9 11 3 3 3-3" />
      <path d="M10 18h4" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function IosStep({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <HStack gap={3} align="center">
      <Flex
        align="center"
        justify="center"
        w="30px"
        h="30px"
        flexShrink={0}
        borderRadius="8px"
        bg="rgba(249,115,22,0.12)"
        borderWidth="1px"
        borderColor="rgba(249,115,22,0.35)"
        color={c.accent}
      >
        {icon}
      </Flex>
      <Text fontSize="13px" color={c.muted} lineHeight="1.45">
        {children}
      </Text>
    </HStack>
  );
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [cookieChoiceMade, setCookieChoiceMade] = useState(false);

  const canPrompt = useMemo(() => {
    if (!mode) return false;
    if (isStandaloneDisplay()) return false;
    if (hasInstalledFlag()) return false;
    if (isSnoozed()) return false;
    return cookieChoiceMade;
  }, [mode, cookieChoiceMade]);

  useEffect(() => {
    registerPwaServiceWorker();

    if (isStandaloneDisplay()) {
      markInstalled();
      return;
    }

    if (getConsent()) setCookieChoiceMade(true);

    const handleCookieChoice = () => setCookieChoiceMade(true);
    const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setMode('native');
    };
    const handleAppInstalled = () => {
      markInstalled();
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('cookie-consent-updated', handleCookieChoice);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (isIosDevice()) {
      setMode('ios');
    }

    return () => {
      window.removeEventListener('cookie-consent-updated', handleCookieChoice);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!canPrompt || visible) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [canPrompt, visible]);

  const dismiss = useCallback(() => {
    snoozePrompt();
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        markInstalled();
      } else {
        snoozePrompt();
      }

      setVisible(false);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  if (!visible || !mode) return null;

  const isNative = mode === 'native' && deferredPrompt;

  return (
    <Box
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-install-title"
      position="fixed"
      left={{ base: '14px', md: '24px' }}
      right={{ base: '14px', md: 'auto' }}
      bottom={{
        base: 'calc(env(safe-area-inset-bottom, 0px) + 98px)',
        md: '24px',
      }}
      zIndex={90}
      w={{ base: 'auto', md: '380px' }}
      maxW={{ base: 'calc(100vw - 28px)', md: '380px' }}
      bg="rgba(24,24,27,0.96)"
      borderWidth="1px"
      borderColor="rgba(249,115,22,0.38)"
      borderRadius="8px"
      boxShadow="0 18px 50px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,255,255,0.04) inset"
      p={{ base: 4, md: 5 }}
      style={{
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        animation: 'fadeSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <HStack align="start" justify="space-between" gap={4}>
        <HStack align="center" gap={3}>
          <Flex
            align="center"
            justify="center"
            w="42px"
            h="42px"
            flexShrink={0}
            borderRadius="8px"
            bg="linear-gradient(135deg, #f97316 0%, #c2410c 100%)"
            color="white"
            boxShadow="0 10px 24px rgba(249,115,22,0.25)"
          >
            <InstallIcon />
          </Flex>
          <Box>
            <Text
              id="pwa-install-title"
              fontSize="16px"
              fontWeight="800"
              color={c.text}
              lineHeight="1.2"
            >
              Install Tyre Rescue
            </Text>
            <Text fontSize="12px" color={c.muted} mt="3px" lineHeight="1.35">
              Save it to your home screen for quick access.
            </Text>
          </Box>
        </HStack>
        <CloseButton
          size="sm"
          color={c.muted}
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        />
      </HStack>

      {isNative ? (
        <Flex mt={4} gap={2} direction={{ base: 'column', sm: 'row' }}>
          <Button
            flex={1}
            h="42px"
            bg={c.accent}
            color={c.bg}
            fontSize="13px"
            fontWeight="800"
            borderRadius="6px"
            _hover={{ bg: c.accentHover }}
            _active={{ transform: 'scale(0.98)' }}
            loading={installing}
            loadingText="Installing"
            onClick={install}
          >
            Install app
          </Button>
          <Button
            h="42px"
            variant="outline"
            borderColor={c.border}
            color={c.muted}
            fontSize="13px"
            borderRadius="6px"
            _hover={{ borderColor: c.accent, color: c.text }}
            onClick={dismiss}
          >
            Not now
          </Button>
        </Flex>
      ) : (
        <VStack align="stretch" gap={3} mt={4}>
          <IosStep icon={<ShareIcon />}>Tap the browser Share button.</IosStep>
          <IosStep icon={<HomeIcon />}>Choose Add to Home Screen.</IosStep>
          <Button
            h="42px"
            bg={c.accent}
            color={c.bg}
            fontSize="13px"
            fontWeight="800"
            borderRadius="6px"
            _hover={{ bg: c.accentHover }}
            _active={{ transform: 'scale(0.98)' }}
            onClick={dismiss}
          >
            Got it
          </Button>
        </VStack>
      )}
    </Box>
  );
}
