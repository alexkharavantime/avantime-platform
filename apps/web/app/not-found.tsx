import type { Metadata } from 'next';

// Next's built-in 404 page, unchanged. A 404 (including a withdrawn CMS translation) must not
// advertise a canonical URL or hreflang alternates; the root layout lists every locale.
export { default } from 'next/dist/client/components/builtin/not-found';

export const metadata: Metadata = { alternates: null };
