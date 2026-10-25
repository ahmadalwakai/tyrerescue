'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { PHONE_DISPLAY, PHONE_TEL } from '@/lib/seo-data';

const STORAGE_KEY = 'callbar-dismissed';

export function MobileCallBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // ignore
    }
    const id = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(id);
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  const show = visible && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="mobile-callbar"
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          role="complementary"
          aria-label="Emergency call prompt"
        >
          <div className="mobile-callbar-text">
            <span className="mobile-callbar-headline">Flat tyre right now?</span>
            <span className="mobile-callbar-sub">We&apos;re 35 min away</span>
          </div>
          <a className="mobile-callbar-btn" href={`tel:${PHONE_TEL}`} aria-label={`Call ${PHONE_DISPLAY}`}>
            CALL NOW
          </a>
          <button
            className="mobile-callbar-dismiss"
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
