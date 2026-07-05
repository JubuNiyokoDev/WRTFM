import { cn } from '@/lib/utils';

type IllustrationKind = 'earn' | 'proof' | 'review' | 'wallet' | 'campaign' | 'empty';
type IllustrationVariant = 'primary' | 'secondary' | 'transfer';

const kindCopy: Record<IllustrationKind, { title: string; accent: string }> = {
  earn: { title: 'Earn', accent: '#00B894' },
  proof: { title: 'Proof', accent: '#74B9FF' },
  review: { title: 'Review', accent: '#FF8A80' },
  wallet: { title: 'Wallet', accent: '#A29BFE' },
  campaign: { title: 'Campaign', accent: '#6C5CE7' },
  empty: { title: 'Empty', accent: '#B2BEC3' },
};

const imageAssets: Partial<Record<IllustrationKind, Partial<Record<IllustrationVariant, string>>>> = {
  earn: {
    primary: '/hero-earn.jpg',
  },
  proof: {
    primary: '/proof-upload-2.jpg',
  },
  review: {
    primary: '/verification-shield.jpg',
  },
  wallet: {
    primary: '/wallet-crypto-2.jpg',
    secondary: '/wallet-crypto.jpg',
    transfer: '/proof-upload.jpg',
  },
  campaign: {
    primary: '/task-checklist.jpg',
  },
};

export function AppIllustration({
  kind,
  className,
  variant = 'primary',
  fit = 'cover',
}: {
  kind: IllustrationKind;
  className?: string;
  variant?: IllustrationVariant;
  fit?: 'cover' | 'contain';
}) {
  const config = kindCopy[kind];
  const imageSrc = imageAssets[kind]?.[variant] ?? imageAssets[kind]?.primary;

  if (imageSrc) {
    return (
      <figure
        className={cn(
          'relative isolate overflow-hidden rounded-[18px] border border-border/70 bg-card shadow-sm',
          'w-full max-w-[260px]',
          className,
        )}
      >
        <img
          src={imageSrc}
          alt={config.title}
          loading="lazy"
          decoding="async"
          className={cn(
            'aspect-[4/3] h-auto w-full bg-white',
            fit === 'contain' ? 'object-contain p-2' : 'object-cover',
          )}
        />
      </figure>
    );
  }

  return (
    <svg
      viewBox="0 0 220 180"
      role="img"
      aria-label={config.title}
      className={cn('h-auto w-full max-w-[220px]', className)}
      fill="none"
    >
      <rect x="12" y="24" width="196" height="132" rx="28" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <circle cx="172" cy="48" r="18" fill={config.accent} opacity="0.22" />
      <circle cx="44" cy="132" r="24" fill={config.accent} opacity="0.16" />
      <path d="M42 126C65 84 91 68 126 76C158 83 171 68 188 43" stroke={config.accent} strokeWidth="8" strokeLinecap="round" opacity="0.9" />
      <path d="M161 43H188V70" stroke={config.accent} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

      {kind === 'earn' && (
        <>
          <rect x="64" y="90" width="92" height="48" rx="16" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <circle cx="110" cy="114" r="18" fill="#00B894" opacity="0.18" />
          <path d="M110 99V129M99 108C99 101 121 101 121 109C121 118 99 111 99 121C99 130 122 129 122 121" stroke="#00B894" strokeWidth="5" strokeLinecap="round" />
        </>
      )}

      {kind === 'proof' && (
        <>
          <rect x="66" y="66" width="88" height="82" rx="14" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <path d="M86 92H134M86 113H128M86 134H112" stroke="#74B9FF" strokeWidth="6" strokeLinecap="round" />
          <circle cx="142" cy="74" r="18" fill="#74B9FF" />
          <path d="M134 74L140 80L151 68" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {kind === 'review' && (
        <>
          <rect x="58" y="78" width="104" height="58" rx="18" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <path d="M82 107L101 124L140 88" stroke="#FF8A80" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="72" cy="64" r="10" fill="#FF8A80" opacity="0.5" />
          <circle cx="152" cy="142" r="8" fill="#FF8A80" opacity="0.5" />
        </>
      )}

      {kind === 'wallet' && (
        <>
          <rect x="55" y="80" width="112" height="64" rx="18" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <path d="M55 98H154C166 98 174 106 174 116C174 126 166 134 154 134H136" stroke="#A29BFE" strokeWidth="8" strokeLinecap="round" />
          <circle cx="148" cy="116" r="7" fill="#A29BFE" />
          <rect x="75" y="56" width="66" height="28" rx="12" fill="#A29BFE" opacity="0.22" />
        </>
      )}

      {kind === 'campaign' && (
        <>
          <rect x="58" y="76" width="64" height="64" rx="18" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <path d="M122 91L161 74V143L122 126V91Z" fill="#6C5CE7" opacity="0.28" stroke="#6C5CE7" strokeWidth="5" strokeLinejoin="round" />
          <path d="M75 103H104M75 119H94" stroke="#6C5CE7" strokeWidth="6" strokeLinecap="round" />
        </>
      )}

      {kind === 'empty' && (
        <>
          <rect x="63" y="78" width="94" height="58" rx="18" fill="hsl(var(--background))" stroke="hsl(var(--border))" />
          <path d="M86 105H134M95 122H125" stroke="#B2BEC3" strokeWidth="6" strokeLinecap="round" />
          <circle cx="110" cy="69" r="12" fill="#B2BEC3" opacity="0.3" />
        </>
      )}
    </svg>
  );
}
