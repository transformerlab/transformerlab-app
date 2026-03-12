/**
 * ModelRegistry.tsx
 *
 * Displays asset-version groups for models (from the asset_versions API).
 * Each group renders as an expandable accordion row showing its versions.
 * This is the "Model Registry" tab inside ModelZoo.
 */

import { useCallback, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Option,
  Select,
  Sheet,
  Skeleton,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import {
  CalendarIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
  PackageIcon,
  LayersIcon,
} from 'lucide-react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VersionEntry {
  id: string;
  asset_type: string;
  group_name: string;
  version: number;
  asset_id: string;
  tag: string | null;
  job_id: string | null;
  description: string | null;
  title: string | null;
  long_description: string | null;
  cover_image: string | null;
  evals: Record<string, unknown> | null;
  extra_metadata: Record<string, unknown> | null;
  created_at: string | null;
}

interface GroupSummary {
  group_name: string;
  asset_type: string;
  version_count: number;
  latest_version: number;
  latest_tag: string | null;
  latest_created_at: string | null;
}

// ─── Tag colours (shared with AssetVersionsDrawer) ───────────────────────────

const TAG_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'neutral'> = {
  latest: 'primary',
  production: 'success',
  draft: 'warning',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatRelativeDate(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return isoString;
  }
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function RegistrySkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      {[...Array(4)].map((_, i) => (
        <Box key={i} sx={{ mb: 1.5 }}>
          <Skeleton variant="rectangular" width="100%" height={56} sx={{ borderRadius: 8 }} />
        </Box>
      ))}
    </Box>
  );
}

// ─── Expanded version row (inline in the accordion) ──────────────────────────

function VersionRow({
  v,
  assetType,
  groupName,
  updatingVersion,
  selectingVersion,
  isCurrentFoundation,
  onSetTag,
  onClearTag,
  onDelete,
  onSelect,
}: {
  v: VersionEntry;
  assetType: string;
  groupName: string;
  updatingVersion: number | null;
  selectingVersion: number | null;
  isCurrentFoundation: boolean;
  onSetTag: (version: number, tag: string) => void;
  onClearTag: (version: number) => void;
  onDelete: (version: number) => void;
  onSelect: (version: VersionEntry) => void;
}) {
  return (
    <tr key={v.id}>
      <td>
        <Typography level="title-sm" fontFamily="monospace">
          v{v.version}
        </Typography>
      </td>
      <td>
        <Tooltip title={v.description || v.asset_id}>
          <Typography level="body-sm" noWrap sx={{ maxWidth: 200 }}>
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
                onClick={() => onClearTag(v.version)}
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
              if (val) onSetTag(v.version, val as string);
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
          <Typography level="body-xs">{formatDate(v.created_at)}</Typography>
        </Stack>
      </td>
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
        <Stack direction="row" alignItems="center" gap={0.5}>
          {isCurrentFoundation ? (
            <Chip size="sm" variant="soft" color="success" startDecorator={<CheckCircle2Icon size={12} />}>
              Active
            </Chip>
          ) : selectingVersion === v.version ? (
            <Button size="sm" variant="soft" color="neutral" disabled startDecorator={<CircularProgress size="sm" thickness={2} />}>
              Loading…
            </Button>
          ) : (
            <Button
              size="sm"
              variant="soft"
              color="success"
              onClick={() => onSelect(v)}
              startDecorator={<PlayIcon size={12} />}
            >
              Select
            </Button>
          )}
          <IconButton
            size="sm"
            variant="plain"
            color="danger"
            onClick={() => onDelete(v.version)}
            disabled={updatingVersion === v.version}
          >
            <Trash2Icon size={16} />
          </IconButton>
        </Stack>
      </td>
    </tr>
  );
}

// ─── Expanded group content ──────────────────────────────────────────────────

function GroupVersionsTable({
  groupName,
  assetType,
  mutateGroups,
  experimentInfo,
  experimentInfoMutate,
  currentFoundation,
}: {
  groupName: string;
  assetType: string;
  mutateGroups: () => void;
  experimentInfo: any;
  experimentInfoMutate: () => void;
  currentFoundation: string;
}) {
  const [updatingVersion, setUpdatingVersion] = useState<number | null>(null);
  const [selectingVersion, setSelectingVersion] = useState<number | null>(null);

  const {
    data: versions,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListVersions(assetType, groupName),
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
      mutateGroups();
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
      mutateGroups();
    } catch (error) {
      console.error('Failed to clear tag:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  const handleDeleteVersion = async (version: number) => {
    if (
      !window.confirm(
        `Delete version ${version} from group "${groupName}"? This will not delete the underlying model.`,
      )
    ) {
      return;
    }
    setUpdatingVersion(version);
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteVersion(assetType, groupName, version),
        { method: 'DELETE' },
      );
      mutate();
      mutateGroups();
    } catch (error) {
      console.error('Failed to delete version:', error);
    } finally {
      setUpdatingVersion(null);
    }
  };

  /**
   * Select a version's underlying model as the experiment foundation.
   *
   * Flow:
   * 1. Use the version's asset_id to fetch model details from the filesystem.
   * 2. Look up a compatible inference engine.
   * 3. Update the experiment config (foundation, filename, architecture, engine).
   */
  const handleSelectVersion = async (v: VersionEntry) => {
    if (!experimentInfo?.id) return;

    setSelectingVersion(v.version);
    try {
      // 1. Fetch model details by asset_id
      const detailResp = await fetchWithAuth(
        chatAPI.Endpoints.Models.ModelDetailsFromFilesystem(v.asset_id),
      );
      const modelDetails = detailResp.ok ? await detailResp.json() : {};

      // Build a model object matching what setFoundation expects
      const architecture = modelDetails?.architecture || '';
      const modelFilename = modelDetails?.model_filename || '';

      // Determine foundation filename
      // For filesystem models we need the local path; for HuggingFace models we use model_filename
      let foundationFilename = '';

      // Try to get detailed model info from the local model list for local_path / stored_in_filesystem
      const localListResp = await fetchWithAuth(
        chatAPI.Endpoints.Models.LocalList(),
      );
      const localModels = localListResp.ok ? await localListResp.json() : [];
      const localModel = Array.isArray(localModels)
        ? localModels.find((m: any) => m.model_id === v.asset_id)
        : null;

      if (localModel?.stored_in_filesystem) {
        foundationFilename = localModel.local_path || '';
      } else if (modelFilename) {
        foundationFilename = modelFilename;
      }

      // 2. Auto-detect a compatible inference engine
      const additionalConfigs: Record<string, string> = {};
      if (architecture) {
        try {
          const enginesResp = await fetchWithAuth(
            chatAPI.Endpoints.Experiment.ListScriptsOfType(
              experimentInfo.id,
              'loader',
              `model_architectures:${architecture}`,
            ),
          );
          if (enginesResp.ok) {
            const engines = await enginesResp.json();
            if (engines && engines.length > 0) {
              const engine = engines[0];
              additionalConfigs.inferenceParams = JSON.stringify({
                inferenceEngine: engine.uniqueId,
                inferenceEngineFriendlyName: engine.name || '',
              });
            }
          }
        } catch {
          // Silently ignore — user can set engine manually
        }
      }

      // 3. Update experiment configs
      await fetchWithAuth(
        chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo.id),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            foundation: v.asset_id,
            foundation_model_architecture: architecture,
            foundation_filename: foundationFilename,
            adaptor: '',
            generationParams:
              '{"temperature": 0.7,"maxTokens": 1024, "topP": 1.0, "frequencyPenalty": 0.0}',
            ...additionalConfigs,
          }),
        },
      );
      experimentInfoMutate();
    } catch (err) {
      console.error('Failed to select model from registry:', err);
    } finally {
      setSelectingVersion(null);
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
      <Typography level="body-sm" color="neutral" sx={{ py: 2, textAlign: 'center' }}>
        No versions in this group.
      </Typography>
    );
  }

  return (
    <Table
      size="sm"
      sx={{
        '& thead th': { textAlign: 'left' },
        '& tbody td': { verticalAlign: 'middle' },
      }}
    >
      <thead>
        <tr>
          <th style={{ width: 60 }}>Version</th>
          <th>Model ID</th>
          <th style={{ width: 130 }}>Tag</th>
          <th style={{ width: 150 }}>Created</th>
          <th style={{ width: 90 }}>Job</th>
          <th style={{ width: 140 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {versionList.map((v) => (
          <VersionRow
            key={v.id}
            v={v}
            assetType={assetType}
            groupName={groupName}
            updatingVersion={updatingVersion}
            selectingVersion={selectingVersion}
            isCurrentFoundation={currentFoundation === v.asset_id}
            onSetTag={handleSetTag}
            onClearTag={handleClearTag}
            onDelete={handleDeleteVersion}
            onSelect={handleSelectVersion}
          />
        ))}
      </tbody>
    </Table>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ModelRegistry() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { experimentInfo, experimentInfoMutate } = useExperimentInfo();

  // Current foundation model for highlighting the active version
  const currentFoundation: string = experimentInfo?.config?.foundation || '';

  const {
    data: groups,
    isLoading,
    isError,
    mutate: mutateGroups,
  } = useSWR(
    chatAPI.Endpoints.AssetVersions.ListGroups('model'),
    fetcher,
  );

  const handleDeleteGroup = async (groupName: string) => {
    if (
      !window.confirm(
        `Delete group "${groupName}" and ALL its versions? The underlying models will not be deleted.`,
      )
    ) {
      return;
    }
    try {
      await fetchWithAuth(
        chatAPI.Endpoints.AssetVersions.DeleteGroup('model', groupName),
        { method: 'DELETE' },
      );
      mutateGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  /**
   * Resolve the best version for a group (using the resolve endpoint) and
   * set it as the experiment foundation.
   *
   * Resolution priority (server-side):
   *   exact version → specified tag → "latest" tag → highest version number
   */
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);

  const handleResolveAndSelect = useCallback(
    async (groupName: string) => {
      if (!experimentInfo?.id) return;
      setResolvingGroup(groupName);
      try {
        // 1. Resolve the best version via the resolve endpoint
        const resolveResp = await fetchWithAuth(
          chatAPI.Endpoints.AssetVersions.Resolve('model', groupName),
        );
        if (!resolveResp.ok) {
          console.error('Resolve failed:', resolveResp.statusText);
          return;
        }
        const resolved = await resolveResp.json();
        if (!resolved || !resolved.asset_id) {
          console.error('No version resolved for group:', groupName);
          return;
        }

        // 2. Fetch model details for the resolved asset_id
        const detailResp = await fetchWithAuth(
          chatAPI.Endpoints.Models.ModelDetailsFromFilesystem(resolved.asset_id),
        );
        const modelDetails = detailResp.ok ? await detailResp.json() : {};
        const architecture = modelDetails?.architecture || '';
        const modelFilename = modelDetails?.model_filename || '';

        // Get local model info for local_path
        let foundationFilename = '';
        const localListResp = await fetchWithAuth(
          chatAPI.Endpoints.Models.LocalList(),
        );
        const localModels = localListResp.ok ? await localListResp.json() : [];
        const localModel = Array.isArray(localModels)
          ? localModels.find((m: any) => m.model_id === resolved.asset_id)
          : null;

        if (localModel?.stored_in_filesystem) {
          foundationFilename = localModel.local_path || '';
        } else if (modelFilename) {
          foundationFilename = modelFilename;
        }

        // 3. Auto-detect inference engine
        const additionalConfigs: Record<string, string> = {};
        if (architecture) {
          try {
            const enginesResp = await fetchWithAuth(
              chatAPI.Endpoints.Experiment.ListScriptsOfType(
                experimentInfo.id,
                'loader',
                `model_architectures:${architecture}`,
              ),
            );
            if (enginesResp.ok) {
              const engines = await enginesResp.json();
              if (engines?.length > 0) {
                additionalConfigs.inferenceParams = JSON.stringify({
                  inferenceEngine: engines[0].uniqueId,
                  inferenceEngineFriendlyName: engines[0].name || '',
                });
              }
            }
          } catch {
            // User can set engine manually
          }
        }

        // 4. Update experiment configs
        await fetchWithAuth(
          chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo.id),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              foundation: resolved.asset_id,
              foundation_model_architecture: architecture,
              foundation_filename: foundationFilename,
              adaptor: '',
              generationParams:
                '{"temperature": 0.7,"maxTokens": 1024, "topP": 1.0, "frequencyPenalty": 0.0}',
              ...additionalConfigs,
            }),
          },
        );
        experimentInfoMutate();
      } catch (err) {
        console.error('Failed to resolve and select model:', err);
      } finally {
        setResolvingGroup(null);
      }
    },
    [experimentInfo, experimentInfoMutate],
  );

  if (isLoading) return <RegistrySkeleton />;
  if (isError) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="danger">Failed to load model registry groups.</Typography>
      </Box>
    );
  }

  const groupList: GroupSummary[] = Array.isArray(groups) ? groups : [];

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
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          py: 1.5,
        }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <LayersIcon size={20} />
          <Typography level="title-lg">Model Registry</Typography>
          <Chip size="sm" variant="soft" color="neutral">
            {groupList.length} group{groupList.length !== 1 ? 's' : ''}
          </Chip>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
        {groupList.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <PackageIcon size={48} color="gray" style={{ marginBottom: 16 }} />
            <Typography level="body-lg" color="neutral">
              No model groups yet.
            </Typography>
            <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
              Publish a model from the Jobs page to create your first group.
            </Typography>
          </Box>
        ) : (
          <AccordionGroup
            sx={{
              borderRadius: 'md',
              [`& .MuiAccordion-root`]: {
                marginTop: '0.5rem',
                transition: '0.2s ease',
                '& button:not([aria-expanded="true"])': {
                  transition: '0.2s ease',
                  paddingBottom: '0.625rem',
                },
                '& button:hover': {
                  background: 'transparent',
                },
              },
            }}
          >
            {groupList.map((group) => {
              const isExpanded = expandedGroups.has(group.group_name);
              return (
                <Accordion
                  key={group.group_name}
                  expanded={isExpanded}
                  onChange={() => toggleGroup(group.group_name)}
                  sx={{
                    borderRadius: 'md',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AccordionSummary
                    indicator={<ChevronDownIcon size={18} />}
                    sx={{ px: 2, py: 1.5 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        pr: 1,
                      }}
                    >
                      {/* Left side: Name + badges */}
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        <PackageIcon size={18} />
                        <Typography level="title-md" fontWeight="lg">
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

                      {/* Right side: Use latest + last updated + delete */}
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        {resolvingGroup === group.group_name ? (
                          <Button
                            size="sm"
                            variant="soft"
                            color="neutral"
                            disabled
                            startDecorator={<CircularProgress size="sm" thickness={2} />}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Selecting…
                          </Button>
                        ) : (
                          <Tooltip title="Resolve the best version (latest/production) and set as experiment foundation">
                            <Button
                              size="sm"
                              variant="soft"
                              color="success"
                              startDecorator={<PlayIcon size={14} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveAndSelect(group.group_name);
                              }}
                            >
                              Use
                            </Button>
                          </Tooltip>
                        )}
                        <Typography level="body-xs" color="neutral">
                          {formatRelativeDate(group.latest_created_at)}
                        </Typography>
                        <Tooltip title="Delete group">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(group.group_name);
                            }}
                          >
                            <Trash2Icon size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  </AccordionSummary>

                  <AccordionDetails sx={{ px: 2, pb: 2 }}>
                    {isExpanded && (
                      <GroupVersionsTable
                        groupName={group.group_name}
                        assetType="model"
                        mutateGroups={mutateGroups}
                        experimentInfo={experimentInfo}
                        experimentInfoMutate={experimentInfoMutate}
                        currentFoundation={currentFoundation}
                      />
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </AccordionGroup>
        )}
      </Box>
    </Sheet>
  );
}
