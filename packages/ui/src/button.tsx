import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-white shadow-lg shadow-blue-600/20 hover:bg-[var(--primary-dark)]',
  secondary:
    'border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--primary)]',
  ghost:
    'border border-transparent bg-transparent text-[var(--primary-dark)] hover:bg-white/70',
};

export function Button({ children, href, variant = 'primary' }: ButtonProps) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition ${variants[variant]}`}
    >
      {children}
    </a>
  );
}
