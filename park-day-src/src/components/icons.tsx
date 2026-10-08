// Small inline line icons so the app has no icon-font dependency.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const CastleIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M3 21V11l2-2 2 2V7l2.5-4L12 7V5l2.5-2L17 5v6l2-2 2 2v10z" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
  </svg>
);

export const ClockIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const TimelineIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M6 3v18" />
    <circle cx="6" cy="7" r="2" />
    <circle cx="6" cy="17" r="2" />
    <path d="M11 7h9M11 17h9M11 12h6" />
  </svg>
);

export const CoasterIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M2 18c3 0 4-9 8-9s3 7 6 7 3-6 6-6" />
    <path d="M4 21v-3M10 21V9M16 21v-5M21 21V10" />
  </svg>
);

export const ShowIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M3 4h18v3H3z" />
    <path d="M4 7c0 6 2 11 5 13M20 7c0 6-2 11-5 13" />
    <path d="M9 20h6" />
  </svg>
);

export const FoodIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" />
    <path d="M17 21V3c-2 1-3 4-3 7h3" />
  </svg>
);

export const BarsIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />
  </svg>
);

export const RefreshIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </svg>
);

export const PinIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const SparkIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </svg>
);

export const CopyIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const CheckIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const ChevronIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const WalkIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <circle cx="13" cy="4" r="1.6" />
    <path d="M10 21l2-6 3 3v3M9 11l3-3 3 3 3 1M12 8l-1 5" />
  </svg>
);

export const PumpkinIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    <path d="M12 6c-5 0-8 3-8 7.5S7 21 12 21s8-3 8-7.5S17 6 12 6z" />
    <path d="M12 6c-2 2-2 13 0 15M12 6c2 2 2 13 0 15M12 6V3l2-1" />
  </svg>
);
