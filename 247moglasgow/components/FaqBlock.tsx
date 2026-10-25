'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { Faq } from '@/lib/content';
import { AnimatedSection } from '@/components/Animated';

export function FaqBlock({ faqs, title = 'FAQ' }: { faqs: Faq[]; title?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const half = Math.ceil(faqs.length / 2);
  const col1 = faqs.slice(0, half);
  const col2 = faqs.slice(half);

  function FaqItem({ faq, index }: { faq: Faq; index: number }) {
    const open = openIndex === index;
    return (
      <div className="faq-item">
        <button
          className="faq-row"
          type="button"
          onClick={() => setOpenIndex(open ? null : index)}
          aria-expanded={open}
        >
          <span className="faq-q">{faq.question}</span>
          <motion.span
            className="faq-arrow"
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden="true"
          >
            +
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="faq-answer-wrap"
            >
              <p className="faq-answer">{faq.answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <section className="section faq-section">
      <div className="container">
        <AnimatedSection>
          <p className="eyebrow">Questions</p>
          <h2 className="section-title bordered-title">{title}</h2>
        </AnimatedSection>
        <div className="faq-grid">
          <div className="faq-col">
            {col1.map((faq, i) => (
              <FaqItem key={faq.question} faq={faq} index={i} />
            ))}
          </div>
          <div className="faq-col">
            {col2.map((faq, i) => (
              <FaqItem key={faq.question} faq={faq} index={i + half} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
