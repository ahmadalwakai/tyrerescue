'use client';

import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.65, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedItem({
  children,
  className,
  delay = 0,
  from = 'up',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: 'left' | 'up';
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: from === 'left' ? -26 : 0, y: from === 'up' ? 28 : 0 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.52, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedHeroTitle({ text }: { text: string }) {
  const words = text.split(' ');

  return (
    <h1 className="hero-title">
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, ease: 'easeOut', delay: index * 0.15 }}
        >
          {word}
          {index < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </h1>
  );
}

export function AnimatedHeroLines({ lines }: { lines: string[] }) {
  let wordIndex = 0;

  return (
    <h1 className="hero-title hero-title-redesign">
      {lines.map((line) => (
        <span className="hero-title-line" key={line}>
          {line.split(' ').map((word, index, words) => {
            const delay = wordIndex * 0.12;
            wordIndex += 1;

            return (
              <motion.span
                key={`${word}-${wordIndex}`}
                initial={{ opacity: 0, y: 60, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.62, ease: 'easeOut', delay }}
              >
                {word}
                {index < words.length - 1 ? ' ' : ''}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

export function AnimatedStat({
  label,
  value,
  prefix = '',
  suffix = '',
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => `${prefix}${Math.round(latest)}${suffix}`);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useMotionValueEvent(rounded, 'change', setDisplay);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, { type: 'spring', stiffness: 90, damping: 20 });
    return () => controls.stop();
  }, [count, inView, value]);

  return (
    <div ref={ref} className="stat-card">
      <span className="stat-value">{display}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
