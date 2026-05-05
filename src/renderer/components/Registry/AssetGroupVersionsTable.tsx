import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Option,
  Select,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { BriefcaseIcon, Trash2Icon, XIcon } from 'lucide-react';
import {
  useSWRWithAuth as useSWR,
  fetchWithAuth,
} from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';

dayjs.extend(relativeTime);

interface VersionEntry {
  id: string;
  asset_type: string;
  group_name: string;
  version_label: string;
  asset_id: string;
  tag: string | null;
  job_id: string | null;
  description: string | null;
  title: string | null;
  long_description: string | null;
  cover_image: string | null;
  evals: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

const TAG_COLORS: Record<
  string,
  'success' | 'primary' | 'warning' | 'neutral'
> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

interface AssetGroupVersionsTableProps {
  groupId: string;
  assetType: 'model' | 'dataset';
  /** Extra columns to show between Tag and Job, rendered per row from metadata. */
  metadataColumns?: Array<{
    label: string;
    width: number;
    field: string;
  }>;
  onAfterMutation?: () => void;
}

export default function AssetGroupVersionsTable({
  groupId,
  assetType,
  metadataColumns = [],
  onAfterMutation,
}: AssetGroupVersionsTableProps) {
  const [updatingVersion, setUpdatingVersion] = useState<string | null>(null);
  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupId),
    fetcher,
  );

  const afterMutation = () => {
    mutate();
    onAfterMutation?.();
  };

  const handleSetTag = async (versionLabel: string, tag: string) => {
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.SetTag(
          assetType,
          groupId,
          versionLabel,
        ),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      );
      afterMutation();
    } catch (error) {
      console.error('Failed to set tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleClearTag = async (versionLabel: string) => {
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.ClearTag(
          assetType,
          groupId,
          versionLabel,
        ),
        { method: 'DELETE' },
      );
      afterMutation();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (versionLabel: string) => {
    if (
      !window.confirm(
        `Delete version ${versionLabel} from this group? This will not delete the underlying ${assetType}.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(versionLabel);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(
          assetType,
          groupId,
          versionLabel,
        ),
        { method: 'DELETE' },
      );
      afterMutation();
    } catch (error) {
      console.error('Failed to delete version:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const versionList: VersionEntry[] = Array.isArray(versions) ? versions : [];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size="sm" />
      </Box>
    );
  }

  if (versionList.length === 0) {
    return (
      <Typography
        level="body-sm"
        color="neutral"
        sx={{ py: 2, textAlign: 'center' }}
      >
        No versions in this group.
      </Typography>
    );
  }

  return (
    <Table size="sm" stickyHeader hoverRow>
      <thead>
        <tr>
          <th style={{ width: 90 }}>Version</th>
          <th style={{ width: 140 }}>Tag</th>
          {metadataColumns.map((c) => (
            <th key={c.field} style={{ width: c.width }}>
              {c.label}
            </th>
          ))}
          <th style={{ width: 80 }}>Job</th>
          <th style={{ width: 110 }}>Created</th>
          <th style={{ width: 60 }}>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {versionList.map((v) => (
          <tr key={v.id}>
            <td>
              <Tooltip title={`ID: ${v.asset_id}`} placement="right">
                <Typography level="title-sm" fontFamily="monospace">
                  {v.version_label}
                </Typography>
              </Tooltip>
            </td>
            <td>
              {updatingVersion === v.version_label ? (
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
                      onClick={() => handleClearTag(v.version_label)}
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
                    if (val) handleSetTag(v.version_label, val as string);
                  }}
                  sx={{ minWidth: 100 }}
                >
                  <Option value="latest">latest</Option>
                  <Option value="production">production</Option>
                  <Option value="draft">draft</Option>
                </Select>
              )}
            </td>
            {metadataColumns.map((c) => (
              <td key={c.field}>
                <Typography level="body-sm">
                  {(v.metadata as any)?.[c.field] || '—'}
                </Typography>
              </td>
            ))}
            <td>
              {v.job_id ? (
                <Tooltip title={`Job ${v.job_id}`}>
                  <Chip size="sm" variant="outlined" color="neutral">
                    <BriefcaseIcon size={12} />
                    &nbsp;{String(v.job_id).slice(0, 6)}
                  </Chip>
                </Tooltip>
              ) : (
                <Typography level="body-xs" color="neutral">
                  —
                </Typography>
              )}
            </td>
            <td>
              <Typography level="body-xs">
                {v.created_at ? dayjs(v.created_at).fromNow() : '—'}
              </Typography>
            </td>
            <td style={{ textAlign: 'right' }}>
              <Trash2Icon
                size={18}
                color="var(--joy-palette-danger-600)"
                style={{ cursor: 'pointer', verticalAlign: 'middle' }}
                onClick={() => handleDeleteVersion(v.version_label)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
