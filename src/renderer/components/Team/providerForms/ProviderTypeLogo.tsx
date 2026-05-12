import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/joy';
import { Cloud } from 'lucide-react';
import type { SimpleIcon } from 'simple-icons/types';
import { siLocal } from 'simple-icons';

const SIMPLE_ICONS: Record<string, SimpleIcon> = {
  local: siLocal,
};

/**
 * Remote logos (Wikimedia Commons, project repos, favicons). Local uses bundled
 * Simple Icons vector; others load at runtime with lucide fallback on error.
 */
const REMOTE_LOGO_URL: Record<string, string> = {
  aws: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
  /** Commons: File:Microsoft_Azure.svg — sourced from azure.microsoft.com (Aug 2021). */
  azure:
    'https://upload.wikimedia.org/wikipedia/commons/f/fa/Microsoft_Azure.svg',
  /** Commons: File:Google_Cloud_logo.svg — Google Cloud wordmark. */
  gcp: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Google_Cloud_logo.svg',
  /** Official wide mark from skypilot-org/skypilot docs (docs/source/images/). */
  skypilot:
    'https://raw.githubusercontent.com/skypilot-org/skypilot/master/docs/source/images/SkyPilot-logo-wide.png',
  /** Commons: File:Slurm_logo.svg — SLURM Workload Manager logo (GPL, not SchedMD favicon). */
  slurm: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Slurm_logo.svg',
  runpod: 'https://www.google.com/s2/favicons?domain=runpod.io&sz=128',
  dstack: 'https://www.google.com/s2/favicons?domain=dstack.ai&sz=128',
  vastai: 'https://www.google.com/s2/favicons?domain=vast.ai&sz=128',
};

function SimpleIconMark({ icon, size }: { icon: SimpleIcon; size: number }) {
  const inner = Math.round(size * 0.72);
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={inner}
      height={inner}
      aria-hidden
    >
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  );
}

export interface ProviderTypeLogoProps {
  providerType: string;
  /** Outer box width/height in px */
  size?: number;
}

/**
 * Brand-ish logo for a compute provider type: bundled Simple Icon for `local`,
 * otherwise Wikimedia / official repo / favicon URLs with a lucide fallback.
 */
export default function ProviderTypeLogo({
  providerType,
  size,
}: ProviderTypeLogoProps) {
  const boxSize = size ?? 44;
  const [remoteFailed, setRemoteFailed] = useState(false);
  const simple = SIMPLE_ICONS[providerType];
  const remoteUrl = REMOTE_LOGO_URL[providerType];

  useEffect(() => {
    setRemoteFailed(false);
  }, [providerType]);

  const onRemoteError = useCallback(() => {
    setRemoteFailed(true);
  }, []);

  const shellSx = {
    width: boxSize,
    height: boxSize,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'md',
    bgcolor: 'background.level1',
    border: '1px solid',
    borderColor: 'divider',
    overflow: 'hidden',
  } as const;

  if (simple) {
    return (
      <Box sx={shellSx}>
        <SimpleIconMark icon={simple} size={boxSize} />
      </Box>
    );
  }

  if (remoteUrl && !remoteFailed) {
    return (
      <Box
        component="img"
        src={remoteUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={onRemoteError}
        sx={{
          ...shellSx,
          objectFit: 'contain',
          p: 0.75,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <Box sx={{ ...shellSx, color: 'neutral.500' }}>
      <Cloud size={Math.round(boxSize * 0.45)} strokeWidth={1.75} aria-hidden />
    </Box>
  );
}

ProviderTypeLogo.defaultProps = {
  size: 44,
};
