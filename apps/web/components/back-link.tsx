'use client';

import { useRouter } from 'next/navigation';

type BackLinkProps = {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
};

export function BackLink({ fallbackHref, children, className }: BackLinkProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const cameFromThisSite = document.referrer.startsWith(window.location.origin);
        if (cameFromThisSite && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      {children}
    </button>
  );
}
