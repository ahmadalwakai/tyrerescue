'use client';

import { useEffect } from 'react';

const revealSelector = [
  '.hero-copy',
  '.booking-panel',
  '.hero-support',
  '.content-band',
  '.real-work-copy',
  '.real-work-photo',
  '.journey-step',
  '.service-detail',
  '.experience-card',
  '.coverage-panel',
  '.area-card',
  '.faq-item',
  '.proof-item',
  '.hero-badge',
].join(',');

const parallaxSelector = [
  '.hero-motion-card',
  '.hero-image',
  '.booking-panel',
  '.real-work-photo',
  '.service-detail',
].join(',');

export function MotionEnhancer() {
  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      return;
    }

    const root = document.documentElement;
    root.classList.add('motion-ready');

    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(revealSelector));
    revealItems.forEach((item, index) => {
      item.classList.add('motion-reveal');
      item.style.setProperty('--reveal-index', String(index % 9));
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.12,
      },
    );

    revealItems.forEach((item) => observer.observe(item));

    const parallaxItems = Array.from(document.querySelectorAll<HTMLElement>(parallaxSelector));
    parallaxItems.forEach((item, index) => {
      item.dataset.motionStrength = String((index % 4) + 1);
    });

    let rafId = 0;
    let pointerX = 0;
    let pointerY = 0;

    const commitPointer = () => {
      root.style.setProperty('--pointer-x', pointerX.toFixed(4));
      root.style.setProperty('--pointer-y', pointerY.toFixed(4));
      parallaxItems.forEach((item) => {
        const strength = Number(item.dataset.motionStrength || '1');
        item.style.setProperty('--move-x', `${(pointerX * strength * -8).toFixed(2)}px`);
        item.style.setProperty('--move-y', `${(pointerY * strength * -6).toFixed(2)}px`);
        item.style.setProperty('--tilt-x', `${(pointerY * strength * -1.6).toFixed(2)}deg`);
        item.style.setProperty('--tilt-y', `${(pointerX * strength * 1.6).toFixed(2)}deg`);
      });
      rafId = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;

      if (!rafId) {
        rafId = window.requestAnimationFrame(commitPointer);
      }
    };

    const handleScroll = () => {
      const scrollProgress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1.6);
      root.style.setProperty('--scroll-progress', scrollProgress.toFixed(4));
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handleScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      root.classList.remove('motion-ready');
    };
  }, []);

  return null;
}
