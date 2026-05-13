import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/joy';
import { Cloud, Laptop } from 'lucide-react';

import AwsLogo from './img/aws.png';
import AzureLogo from './img/azure.svg';
import GcpLogo from './img/gcp.svg';
import SkypilotLogo from './img/skypilot.svg';
import SlurmLogo from './img/slurm.svg';
import RunpodLogo from './img/runpod.png';
import DstackLogo from './img/dstack.png';
import VastaiLogo from './img/vastai.png';

type SvgComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;
type LogoAsset = string | SvgComponent;

const PROVIDER_LOGOS: Record<string, LogoAsset> = {
  aws: AwsLogo,
  azure: AzureLogo,
  gcp: GcpLogo,
  skypilot: SkypilotLogo,
  slurm: SlurmLogo,
  runpod: RunpodLogo,
  dstack: DstackLogo,
  vastai: VastaiLogo,
};

export interface ProviderTypeLogoProps {
  providerType: string;
  /** Outer box width/height in px */
  size?: number;
}

/**
 * Brand-ish logo for a compute provider type: a lucide laptop for `local`,
 * locally-bundled PNG/SVG assets for known providers, and a cloud fallback.
 */
export default function ProviderTypeLogo({
  providerType,
  size = 44,
}: ProviderTypeLogoProps) {
  const boxSize = size;
  const [assetFailed, setAssetFailed] = useState(false);
  const logo = PROVIDER_LOGOS[providerType];

  useEffect(() => {
    setAssetFailed(false);
  }, [providerType]);

  const onAssetError = useCallback(() => {
    setAssetFailed(true);
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

  if (providerType === 'local') {
    return (
      <Box sx={{ ...shellSx, color: 'neutral.500' }}>
        <Laptop
          size={Math.round(boxSize * 0.5)}
          strokeWidth={1.75}
          aria-hidden
        />
      </Box>
    );
  }

  if (logo && !assetFailed) {
    if (typeof logo === 'string') {
      return (
        <Box
          component="img"
          src={logo}
          alt=""
          loading="lazy"
          onError={onAssetError}
          sx={{
            ...shellSx,
            objectFit: 'contain',
            p: 0.75,
            boxSizing: 'border-box',
          }}
        />
      );
    }
    const SvgLogo = logo;
    const inner = Math.round(boxSize * 0.7);
    return (
      <Box sx={shellSx}>
        <SvgLogo width={inner} height={inner} aria-hidden />
      </Box>
    );
  }

  return (
    <Box sx={{ ...shellSx, color: 'neutral.500' }}>
      <Cloud size={Math.round(boxSize * 0.45)} strokeWidth={1.75} aria-hidden />
    </Box>
  );
}
