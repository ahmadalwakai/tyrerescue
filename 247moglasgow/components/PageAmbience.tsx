'use client';

import { motion } from 'framer-motion';

export function PageAmbience() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent, rgba(249,115,22,0.055), transparent), repeating-linear-gradient(90deg, transparent 0 96px, rgba(249,115,22,0.028) 96px 97px)',
        }}
        animate={{ x: ['-18%', '18%', '-18%'], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent 0 42px, rgba(255,255,255,0.018) 42px 43px)',
        }}
        animate={{ y: [0, 43] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
