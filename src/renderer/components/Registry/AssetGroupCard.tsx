import { ComponentType } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/joy';
import { LucideProps } from 'lucide-react';

export interface GroupSummary {
  group_id: string;
  group_name: string;
  asset_type: string;
  description: string;
  version_count: number;
  latest_version_label: string | null;
  latest_tag: string | null;
  latest_created_at: string | null;
}

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

interface AssetGroupCardProps {
  group: GroupSummary;
  Icon: ComponentType<LucideProps>;
  onOpen: (groupId: string) => void;
}

export default function AssetGroupCard({
  group,
  Icon,
  onOpen,
}: AssetGroupCardProps) {
  return (
    <Box
      onClick={() => onOpen(group.group_id)}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'md',
        p: 1.5,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          borderColor: 'primary.outlinedBorder',
          background: 'background.level1',
        },
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
        <Icon size={16} style={{ flexShrink: 0 }} />
        <Typography
          level="title-sm"
          fontWeight="lg"
          noWrap
          sx={{ flex: 1, minWidth: 0 }}
        >
          {group.group_name}
        </Typography>
        <Chip size="sm" variant="soft" color="neutral">
          {group.version_count} version{group.version_count !== 1 ? 's' : ''}
        </Chip>
        {group.latest_tag && (
          <Chip
            size="sm"
            variant="soft"
            color={TAG_COLORS[group.latest_tag] || 'neutral'}
          >
            {group.latest_tag}
          </Chip>
        )}
      </Stack>

      {group.description && (
        <Tooltip title={group.description} placement="top">
          <Typography level="body-xs" color="neutral" noWrap sx={{ mt: 0.5 }}>
            {group.description}
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}
