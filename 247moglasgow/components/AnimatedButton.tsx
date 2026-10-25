'use client';

import { motion } from 'framer-motion';
import type { MouseEventHandler, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'emergency' | 'ghost';

type AnimatedButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  href?: string;
  className?: string;
  target?: string;
  rel?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
};

const hoverByVariant = {
  primary: {
    scale: 1.03,
    boxShadow: '0 0 24px rgba(249,115,22,0.6)',
  },
  emergency: {
    backgroundColor: '#f97316',
    color: '#000000',
  },
  ghost: {
    borderColor: '#f97316',
    color: '#f97316',
  },
} as const;

const tapByVariant = {
  primary: { scale: 0.97 },
  emergency: { scale: 0.96 },
  ghost: {},
} as const;

export function AnimatedButton({
  children,
  variant = 'primary',
  href,
  className = '',
  target,
  rel,
  type = 'button',
  ...buttonProps
}: AnimatedButtonProps) {
  const classes = `animated-button animated-button-${variant} ${className}`.trim();
  const motionProps = {
    whileHover: hoverByVariant[variant],
    whileTap: tapByVariant[variant],
    transition: { type: 'spring' as const, stiffness: 400, damping: 17 },
  };

  if (href) {
    return (
      <motion.a className={classes} href={href} target={target} rel={rel} {...motionProps}>
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button className={classes} type={type} {...buttonProps} {...motionProps}>
      {children}
    </motion.button>
  );
}
