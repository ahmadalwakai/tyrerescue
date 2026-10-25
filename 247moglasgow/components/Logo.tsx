'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="logo-link" aria-label="247 Mo Glasgow home">
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <motion.span
          initial={{ scale: 0.8 }}
          animate={{
            scale: 1,
            textShadow: [
              '0 0 20px rgba(249,115,22,0)',
              '0 0 40px rgba(249,115,22,0.7)',
              '0 0 20px rgba(249,115,22,0)',
            ],
          }}
          transition={{
            scale: { type: 'spring', stiffness: 300, damping: 20 },
            textShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '36px',
            color: 'white',
            letterSpacing: '-0.02em',
            transformOrigin: 'left center',
          }}
        >
          247
        </motion.span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.25em',
          }}
        >
          MO GLASGOW
        </span>
      </div>
    </Link>
  );
}
