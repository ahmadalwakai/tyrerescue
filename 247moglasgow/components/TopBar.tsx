'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'topbar-dismissed-v1';
const DISMISS_HOURS = 48;

export function TopBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (Date.now() - ts < DISMISS_HOURS * 60 * 60 * 1000) return;
      }
    } catch {
      // ignore
    }
    setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="topbar" role="banner">
      <Link href="/book?type=emergency" className="topbar-link">
        🚨 EMERGENCY CALLOUT AVAILABLE NOW ACROSS ALL GLASGOW POSTCODES →
      </Link>
      <button
        type="button"
        className="topbar-dismiss"
        onClick={dismiss}
        aria-label="Dismiss announcement"
      >
        ×
      </button>
    </div>
  );
}
