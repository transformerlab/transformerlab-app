import { ComponentType, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Sheet,
  Skeleton,
  Stack,
  Typography,
} from '@mui/joy';
import { LucideProps, RotateCcwIcon, SearchIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import AssetGroupCard, { GroupSummary } from './AssetGroupCard';

function GridSkeleton() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 1.5,
      }}
    >
      {[...Array(8)].map((_, i) => (
        <Skeleton
          key={i}
          variant="rectangular"
          sx={{ height: 64, borderRadius: 'md' }}
        />
      ))}
    </Box>
  );
}

interface AssetRegistryGridProps {
  assetType: 'model' | 'dataset';
  detailRoute: (groupId: string) => string;
  Icon: ComponentType<LucideProps>;
  emptyMessage: string;
  emptyHint?: string;
  filterControls?: React.ReactNode;
}

export default function AssetRegistryGrid({
  assetType,
  detailRoute,
  Icon,
  emptyMessage,
  emptyHint,
  filterControls,
}: AssetRegistryGridProps) {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');

  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(chatAPI.Endpoints.AssetVersions.ListGroups(assetType), fetcher);

  const groupList: GroupSummary[] = Array.isArray(groups) ? groups : [];
  const filteredGroups = groupList.filter((g) => {
    const search = searchText.toLowerCase();
    if (search && !g.group_name.toLowerCase().includes(search)) return false;
    return true;
  });

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-end"
        gap={1.5}
        sx={{ pb: 2, flexWrap: 'wrap' }}
      >
        <FormControl size="sm" sx={{ flex: 1, minWidth: 200 }}>
          <FormLabel>Search</FormLabel>
          <Input
            placeholder="Search by name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        {filterControls}

        <IconButton
          variant="outlined"
          color="neutral"
          size="sm"
          onClick={() => mutateGroups()}
          aria-label="Refresh"
          sx={{ height: 32 }}
        >
          <RotateCcwIcon size={16} />
          &nbsp; Refresh
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <GridSkeleton />
        ) : isError ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="danger">Failed to load registry.</Typography>
          </Box>
        ) : filteredGroups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Icon size={48} color="gray" style={{ marginBottom: 16 }} />
            <Typography level="body-lg" color="neutral">
              {searchText ? 'No matches found.' : emptyMessage}
            </Typography>
            {!searchText && emptyHint && (
              <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
                {emptyHint}
              </Typography>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 1.5,
            }}
          >
            {filteredGroups.map((group) => (
              <AssetGroupCard
                key={group.group_id}
                group={group}
                Icon={Icon}
                onOpen={(id) => navigate(detailRoute(id))}
              />
            ))}
          </Box>
        )}
      </Box>
    </Sheet>
  );
}
