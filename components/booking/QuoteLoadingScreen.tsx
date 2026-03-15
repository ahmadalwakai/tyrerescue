'use client';

import { useState, useEffect, useRef } from 'react';
import { colorTokens as c } from '@/lib/design-tokens';

const emergencyMessages = [
  'Checking driver availability...',
  'Calculating travel distance...',
  'Applying emergency rates...',
  'Confirming availability...',
  'Generating your quote...',
];

const scheduledMessages = [
  'Confirming your time slot...',
  'Calculating service distance...',
  'Applying scheduled rates...',
  'Checking tyre availability...',
  'Generating your quote...',
];

interface QuoteLoadingScreenProps {
  isVisible: boolean;
  onComplete: () => void;
  bookingType: 'emergency' | 'scheduled';
}

export function QuoteLoadingScreen({
  isVisible,
  onComplete,
  bookingType,
}: QuoteLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());
  const hasCompleted = useRef(false);

  const messages = bookingType === 'emergency' ? emergencyMessages : scheduledMessages;

  // Reset on show
  useEffect(() => {
    if (isVisible) {
      startTime.current = Date.now();
      hasCompleted.current = false;
      setMessageIndex(0);
      setProgress(0);
      // Trigger progress to 90% after mount
      requestAnimationFrame(() => {
        setProgress(90);
      });
    }
  }, [isVisible]);

  // Cycle messages
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        if (prev >= messages.length - 1) return prev;
        return prev + 1;
      });
    }, 350);

    return () => clearInterval(interval);
  }, [isVisible, messages.length]);

  // Timeout safety: 8s max
  useEffect(() => {
    if (!isVisible) return;

    const timeout = setTimeout(() => {
      if (!hasCompleted.current) {
        hasCompleted.current = true;
        onComplete();
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: c.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          maxWidth: '400px',
          width: '100%',
          paddingLeft: '16px',
          paddingRight: '16px',
          textAlign: 'center',
        }}
      >
        {/* Spinning tyre */}
        <svg
          viewBox="0 0 80 80"
          style={{
            width: '80px',
            height: '80px',
            animation: 'tyreSpin 1.2s linear infinite',
          }}
        >
          {/* Outer circle */}
          <circle cx="40" cy="40" r="35" stroke="#F97316" strokeWidth="8" fill="none" />
          {/* Inner rim */}
          <circle cx="40" cy="40" r="18" stroke="#F97316" strokeWidth="3" fill="none" />
          {/* Hub */}
          <circle cx="40" cy="40" r="5" fill="#F97316" />
          {/* 4 spokes */}
          <line x1="40" y1="22" x2="40" y2="5" stroke="#F97316" strokeWidth="2" />
          <line x1="58" y1="40" x2="75" y2="40" stroke="#F97316" strokeWidth="2" />
          <line x1="40" y1="58" x2="40" y2="75" stroke="#F97316" strokeWidth="2" />
          <line x1="22" y1="40" x2="5" y2="40" stroke="#F97316" strokeWidth="2" />
        </svg>

        {/* Status message */}
        <div
          key={messageIndex}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            color: c.muted,
            animation: 'fadeUp 0.3s ease-out',
            minHeight: '24px',
          }}
        >
          {messages[messageIndex]}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '200px',
            maxWidth: '90%',
            height: '3px',
            background: c.border,
            borderRadius: '99px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: c.accent,
              borderRadius: '99px',
              width: `${progress}%`,
              transition: progress <= 90
                ? 'width 1.2s ease-out'
                : 'width 0.2s ease-out',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manage QuoteLoadingScreen lifecycle.
 * Call `start()` to show loader, then `apiDone()` when API finishes.
 * The hook enforces a minimum display time before calling the callback.
 */
export function useQuoteLoader(onReady: () => void) {
  const [showLoader, setShowLoader] = useState(false);
  const [apiComplete, setApiComplete] = useState(false);
  const startTime = useRef(0);
  const completedRef = useRef(false);

  const start = () => {
    startTime.current = Date.now();
    completedRef.current = false;
    setApiComplete(false);
    setShowLoader(true);
  };

  const apiDone = () => {
    setApiComplete(true);
  };

  useEffect(() => {
    if (!showLoader || !apiComplete || completedRef.current) return;
    completedRef.current = true;

    const elapsed = Date.now() - startTime.current;
    const remaining = Math.max(0, 1400 - elapsed);

    const timer = setTimeout(() => {
      setShowLoader(false);
      onReady();
    }, remaining);

    return () => clearTimeout(timer);
  }, [showLoader, apiComplete, onReady]);

  const handleComplete = () => {
    // Called by timeout safety (8s). Force close.
    if (!completedRef.current) {
      completedRef.current = true;
      setShowLoader(false);
      onReady();
    }
  };

  return { showLoader, start, apiDone, handleComplete };
}
