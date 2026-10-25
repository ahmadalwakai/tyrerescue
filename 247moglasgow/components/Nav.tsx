'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { PHONE_DISPLAY, PHONE_TEL } from '@/lib/seo-data';

const navLinks = [
  { href: '/mobile-tyre-fitting', label: 'Services' },
  { href: '/areas', label: 'Areas' },
  { href: '/emergency-tyre-fitting', label: 'Emergency' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 80);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <nav className={`nav-pill ${scrolled ? 'nav-pill-scrolled' : ''}`} aria-label="Main navigation">
        <Logo />
        <div className="nav-pill-links">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="nav-pill-link">
              {link.label}
            </Link>
          ))}
        </div>
        <div className="nav-pill-right">
          <a className="nav-call-btn" href={`tel:${PHONE_TEL}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .5 3.1.5.7 0 1.3.6 1.3 1.3v3.5c0 .7-.6 1.3-1.3 1.3C10.2 21.5 2.5 13.8 2.5 4.3 2.5 3.6 3.1 3 3.8 3h3.5c.7 0 1.3.6 1.3 1.3 0 1.1.2 2.1.5 3.1.1.4 0 .9-.3 1.2l-2.2 2.2Z" />
            </svg>
            CALL {PHONE_DISPLAY}
          </a>
          <button
            className="nav-hamburger"
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="nav-overlay"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="nav-overlay-top">
              <Logo />
              <button
                className="nav-close"
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <nav className="nav-overlay-links">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link href={link.href} onClick={() => setOpen(false)}>
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.21, duration: 0.28 }}
              >
                <Link href="/book?type=emergency" onClick={() => setOpen(false)}>
                  Book Now
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28, duration: 0.28 }}
              >
                <a href={`tel:${PHONE_TEL}`} onClick={() => setOpen(false)}>
                  {PHONE_DISPLAY}
                </a>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
