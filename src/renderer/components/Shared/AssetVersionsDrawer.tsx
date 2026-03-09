import { useState } from 'react';
import {
  Drawer,
  Sheet,
  Typography,
  Table,
  Chip,
  IconButton,
  Select,
  Option,
  Box,
  Stack,
  Divider,
  CircularProgress,
  Tooltip,
  DialogTitle,
  ModalClose,
} from '@mui/joy';
import {
  TagIcon,
  Trash2Icon,
  CalendarIcon,
  BriefcaseIcon,
  XIcon,
} from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

interface AssetVersionEntry {
  id: string;
  asset_type: string;
  group_name: string;
  version: number;
  asset_id: string;
  tag: string | null;
  job_id: string | null;
  description: string | null;
  created_at: string | null;
}

interface AssetVersionsDrawerProps {
  open: boolean;
  onClose: () => void;
  assetType: 'model' | 'dataset';
  groupName: string;
}

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function AssetVersionsDrawer({
  open,
  onClose,
  assetType,
  groupName,
}: AssetVersionsDrawerProps) {
  const [updatingVersion, setUpdatingVersion] = useState<number | null>(null);

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    open && groupName
      ? chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupName)
      : null,
    fetcher,
  );

  const handleSetTag = async (version: number, tag: string) => {
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.SetTag(assetType, groupName, version),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      );
      mutate();
    } catch (error) {
      console.error('Failed to set tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleClearTag = async (version: number) => {
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.ClearTag(assetType, groupName, version),
        { method: 'DELETE' },
      );
      mutate();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (version: number) => {
    if (
      !window.confirm(
        `Delete version ${version} from group "${groupName}"? This will not delete the underlying ${assetType}.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(
          assetType,
          groupName,
          version,
        ),
        { method: 'DELETE' },
      );
      mutate();
    } catch (error) {
      console.error('Failed to delete version:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const versionList: AssetVersionEntry[] = Array.isArray(versions)
    ? versions
    : [];

  const typeLabel = assetType === 'model' ? 'Model' : 'Dataset';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      size="lg"
      slotProps={{
        content: {
          sx: {
            width: { xs: '100vw', sm: 560 },
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Sheet sx={{ p: 2.5, pb: 1.5 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <DialogTitle>
            <Stack direction="row" alignItems="center" gap={1}>
              <TagIcon size={20} />
              <Typography level="title-lg">
                {typeLabel} Versions: <b>{groupName}</b>
              </Typography>
            </Stack>
          </DialogTitle>
          <ModalClose />
        </Stack>
        <Typography level="body-sm" sx={{ mt: 0.5 }}>
          {versionList.length} version{versionList.length !== 1 ? 's' : ''} in
          this group. Assign tags to control which version is used.
        </Typography>
      </Sheet>

      <Divider />

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {isLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress />
          </Box>
        ) : versionList.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography level="body-lg" color="neutral">
              No versions found for this group.
            </Typography>
          </Box>
        ) : (
          <Table
            size="sm"
            sx={{
              '& thead th': { textAlign: 'left' },
              '& tbody td': { verticalAlign: 'middle' },
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 50 }}>Ver</th>
                <th>{typeLabel} ID</th>
                <th style={{ width: 120 }}>Tag</th>
                <th style={{ width: 140 }}>Created</th>
                <th style={{ width: 80 }}>Job</th>
                <th style={{ width: 60 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versionList.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Typography level="title-sm" fontFamily="monospace">
                      v{v.version}
                    </Typography>
                  </td>
                  <td>
                    <Tooltip title={v.description || v.asset_id}>
                      <Typography level="body-sm" noWrap sx={{ maxWidth: 160 }}>
                        {v.asset_id}
                      </Typography>
                    </Tooltip>
                  </td>
                  <td>
                    {updatingVersion === v.version ? (
                      <CircularProgress size="sm" />
                    ) : v.tag ? (
                      <Chip
                        size="sm"
                        color={TAG_COLORS[v.tag] || 'neutral'}
                        variant="soft"
                        endDecorator={
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => handleClearTag(v.version)}
                            sx={{ '--IconButton-size': '18px', ml: 0.5 }}
                          >
                            <XIcon size={12} />
                          </IconButton>
                        }
                      >
                        {v.tag}
                      </Chip>
                    ) : (
                      <Select
                        size="sm"
                        placeholder="Set tag…"
                        value={null}
                        onChange={(_e, val) => {
                          if (val) handleSetTag(v.version, val as string);
                        }}
                        sx={{ minWidth: 100 }}
                      >
                        <Option value="latest">latest</Option>
                        <Option value="production">production</Option>
                        <Option value="draft">draft</Option>
                      </Select>
                    )}
                  </td>
                  <td>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <CalendarIcon size={12} />
                      <Typography level="body-xs">
                        {formatDate(v.created_at)}
                      </Typography>
                    </Stack>
                  </td>
                  <td>
                    {v.job_id ? (
                      <Tooltip title={`Job ${v.job_id}`}>
                        <Chip size="sm" variant="outlined" color="neutral">
                          <BriefcaseIcon size={12} />
                          &nbsp;{v.job_id.slice(0, 6)}
                        </Chip>
                      </Tooltip>
                    ) : (
                      <Typography level="body-xs" color="neutral">
                        —
                      </Typography>
                    )}
                  </td>
                  <td>
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => handleDeleteVersion(v.version)}
                      disabled={updatingVersion === v.version}
                    >
                      <Trash2Icon size={16} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Box>
    </Drawer>
  );
}
