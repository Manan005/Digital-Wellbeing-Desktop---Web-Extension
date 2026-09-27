import React, { useEffect, useMemo, useState } from 'react';
import { faviconCandidates } from '../utils/favicon';
import type { SiteIcon as SiteIconInfo } from '../utils/storage';

interface SiteIconProps {
  domain: string;
  /** Recorded favicon/origin for the site, if the background has seen it. */
  known?: SiteIconInfo;
  className?: string;
}

/** A site's favicon that falls through to the next source when one fails to load. */
export const SiteIcon: React.FC<SiteIconProps> = ({ domain, known, className }) => {
  const sources = useMemo(() => faviconCandidates(domain, known), [domain, known?.icon, known?.origin]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [sources]);

  if (sources.length === 0) return null;
  return (
    <img
      src={sources[Math.min(index, sources.length - 1)]}
      className={className}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setIndex((i) => (i < sources.length - 1 ? i + 1 : i))}
    />
  );
};
