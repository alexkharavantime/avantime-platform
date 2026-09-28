'use client';

import Image from 'next/image';
import { useState } from 'react';

type ImageVariant = {
  key: string;
  src: string;
  label: string;
  fileName: string;
};

type SolutionImagePreviewProps = {
  enabled: boolean;
  mainSrc: string;
  alt: string;
  variants: ImageVariant[] | null;
  resetLabel: string;
  countLabel: string;
};

export function SolutionImagePreview({
  enabled,
  mainSrc,
  alt,
  variants,
  resetLabel,
  countLabel,
}: SolutionImagePreviewProps) {
  const initialKey = variants?.find((variant) => variant.src === mainSrc)?.key ?? variants?.[0]?.key;
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selectedVariant = variants?.find((variant) => variant.key === selectedKey);

  if (!enabled || !variants?.length) {
    return (
      <div className="relative mb-7 aspect-[3/2] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Image
          src={mainSrc}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-contain"
        />
      </div>
    );
  }

  return (
    <div className="mb-7">
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Image
          src={selectedVariant?.src ?? mainSrc}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-contain"
        />
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
        <span className="truncate" title={selectedVariant?.fileName}>
          {selectedVariant?.fileName}
        </span>
        <span className="shrink-0">{variants.length} {countLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {variants.map((variant) => (
          <button
            key={variant.key}
            type="button"
            aria-label={variant.label}
            aria-pressed={variant.key === selectedKey}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedKey(variant.key);
            }}
            className={`min-w-0 rounded-xl text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${variant.key === selectedKey ? 'ring-2 ring-blue-600 ring-offset-1' : 'hover:ring-1 hover:ring-slate-300'}`}
          >
            <span className="relative block aspect-[3/2] overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Image
                src={variant.src}
                alt=""
                fill
                sizes="(max-width: 768px) 30vw, 10vw"
                className="object-contain"
              />
            </span>
            <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {variant.label}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedKey(initialKey);
        }}
        className="mt-3 text-xs font-bold text-blue-600 underline-offset-2 hover:underline"
      >
        {resetLabel}
      </button>
    </div>
  );
}
