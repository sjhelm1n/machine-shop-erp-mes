import type { SVGProps } from 'react'

export function EndMillIcon({ size, width, height, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg viewBox="0 0 24 24" width={width ?? size ?? 24} height={height ?? size ?? 24} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M7 2h10v6H7z" />
    <path d="M7 8h10l-2 3H9z" />
    <path d="M9 11h6v8a3 3 0 0 1-6 0z" />
    <path d="m9.2 17 5.6-5" />
    <path d="m9.2 21 5.6-5" />
  </svg>
}
