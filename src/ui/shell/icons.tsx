// The shell's own UI icons (UI redesign spec §4.5): 24×24 SVG, stroke 1.7, from the prototype
// (docs/design/prototype/index.html). Decorative: `aria-hidden`, the link or button carries the name.

export type ShellIconName = 'setup' | 'fight' | 'report' | 'sun' | 'moon' | 'keys' | 'text';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function paths(name: ShellIconName) {
  switch (name) {
    case 'setup':
      return (
        <>
          <path {...stroke} d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
          <circle {...stroke} cx="16" cy="6" r="2" />
          <circle {...stroke} cx="10" cy="12" r="2" />
          <circle {...stroke} cx="18" cy="18" r="2" />
        </>
      );
    case 'fight':
      return (
        <>
          <path {...stroke} d="M5 19l9-9M14 4l6 0 0 6-8 8-6-6z" />
          <path {...stroke} d="M4 16l4 4" />
        </>
      );
    case 'report':
      return <path {...stroke} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />;
    case 'sun':
      return (
        <>
          <circle {...stroke} cx="12" cy="12" r="4" />
          <path {...stroke} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case 'moon':
      return <path {...stroke} d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />;
    case 'text':
      return <path {...stroke} d="M5 18l4-12 4 12M6.5 14h5M16 18V9M14 9h4" />;
    case 'keys':
      return (
        <>
          <rect {...stroke} x="3" y="6" width="18" height="12" rx="2" />
          <path {...stroke} d="M7 10h0M11 10h0M15 10h0M8 14h8" />
        </>
      );
  }
}

export function ShellIcon({ name, className }: { name: ShellIconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {paths(name)}
    </svg>
  );
}

/** The brand sigil (32×32). */
export function BrandSigil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M16 2l12 7v14l-12 7-12-7V9z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M10 21l6-12 6 12M12 17h8" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
