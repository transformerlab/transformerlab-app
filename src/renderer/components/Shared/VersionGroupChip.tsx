import { Chip, Tooltip, Stack, Typography } from '@mui/joy';
import { GitBranchIcon } from 'lucide-react';

interface VersionGroupInfo {
  group_name: string;
  version: number;
  tag: string | null;
}

interface VersionGroupChipProps {
  versionGroups: VersionGroupInfo[];
  onClick: (groupName: string) => void;
}

const TAG_COLORS: Record<string, 'success' | 'primary' | 'warning'> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

/**
 * Displays one chip per version group that this asset belongs to.
 * Each chip shows the group name and current tag.
 * Clicking opens the version drawer for that group.
 */
export default function VersionGroupChip({
  versionGroups,
  onClick,
}: VersionGroupChipProps) {
  if (!versionGroups || versionGroups.length === 0) {
    return null;
  }

  // Group by group_name to consolidate (an asset can appear only once per group)
  const groupMap = new Map<string, VersionGroupInfo>();
  for (const vg of versionGroups) {
    groupMap.set(vg.group_name, vg);
  }

  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap">
      {Array.from(groupMap.values()).map((vg) => (
        <Tooltip
          key={vg.group_name}
          title={`Version group "${vg.group_name}" — v${vg.version}${vg.tag ? ` (${vg.tag})` : ''}`}
        >
          <Chip
            size="sm"
            variant="soft"
            color={vg.tag ? TAG_COLORS[vg.tag] || 'neutral' : 'neutral'}
            onClick={(e) => {
              e.stopPropagation();
              onClick(vg.group_name);
            }}
            startDecorator={<GitBranchIcon size={12} />}
            sx={{ cursor: 'pointer' }}
          >
            <Typography level="body-xs" noWrap sx={{ maxWidth: 100 }}>
              {vg.group_name}
            </Typography>
            {vg.tag && (
              <Typography level="body-xs" sx={{ ml: 0.5, opacity: 0.7 }}>
                ({vg.tag})
              </Typography>
            )}
          </Chip>
        </Tooltip>
      ))}
    </Stack>
  );
}
