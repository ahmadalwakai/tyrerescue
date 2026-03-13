'use client';

import { useRef, useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

interface AnimatedProps extends Omit<BoxProps, 'animation'> {
  children: ReactNode;
  /** CSS animation shorthand applied once element is in view */
  animation: CSSProperties;
}

/**
 * Wrapper that stays invisible until the element scrolls into
 * the viewport, then plays the given CSS animation once.
 */
export function Animated({ children, animation, ...rest }: AnimatedProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Box ref={ref} style={visible ? animation : { opacity: 0 }} {...rest}>
      {children}
    </Box>
  );
}
