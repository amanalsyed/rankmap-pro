'use client';

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { trackCheckoutClick, trackInstallClick } from '@/lib/analytics';

type CtaKind = 'install' | 'checkout';

type TrackedOutboundLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  ctaKind: CtaKind;
  location: string;
  children: ReactNode;
};

export default function TrackedOutboundLink({
  href,
  ctaKind,
  location,
  onClick,
  children,
  ...rest
}: TrackedOutboundLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (ctaKind === 'install') trackInstallClick(location);
    else trackCheckoutClick(location);
    onClick?.(event);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
