import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Sheet,
  Input,
  Chip,
  List,
  ListItem,
  ListItemDecorator,
  ListItemContent,
  CircularProgress,
  Alert,
} from '@mui/joy';
import { FileIcon } from 'lucide-react';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { Endpoints, fetcher } from 'renderer/lib/transformerlab-api-sdk';

type TaskFilesModalProps = {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  taskName?: string | null;
};

type TaskFilesResponse = {
  github_files?: string[] | null;
  local_files?: string[] | null;
};

type FileEntry = {
  path: string;
  source: 'github' | 'local';
};

export default function TaskFilesModal({
  open,
  onClose,
  taskId,
  taskName,
}: TaskFilesModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const [search, setSearch] = useState('');
  const [showGithub, setShowGithub] = useState(true);
  const [showLocal, setShowLocal] = useState(true);

  const experimentId = experimentInfo?.id
    ? String(experimentInfo.id)
    : undefined;

  const shouldFetch = open && !!experimentId && !!taskId;

  const { data, error, isLoading, mutate } = useSWR<TaskFilesResponse>(
    shouldFetch && experimentId && taskId
      ? Endpoints.Task.ListFiles(experimentId, String(taskId))
      : null,
    fetcher,
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
      setShowGithub(true);
      setShowLocal(true);
    }
  }, [open]);

  const allFiles: FileEntry[] = useMemo(() => {
    const entries: FileEntry[] = [];
    if (data?.github_files && Array.isArray(data.github_files)) {
      for (const p of data.github_files) {
        entries.push({ path: p, source: 'github' });
      }
    }
    if (data?.local_files && Array.isArray(data.local_files)) {
      for (const p of data.local_files) {
        entries.push({ path: p, source: 'local' });
      }
    }
    return entries;
  }, [data]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allFiles.filter((entry) => {
      if (entry.source === 'github' && !showGithub) return false;
      if (entry.source === 'local' && !showLocal) return false;
      if (!q) return true;
      return entry.path.toLowerCase().includes(q);
    });
  }, [allFiles, search, showGithub, showLocal]);

  const hasGithub = allFiles.some((f) => f.source === 'github');
  const hasLocal = allFiles.some((f) => f.source === 'local');

  const title = taskName
    ? `Files for ${taskName}`
    : taskId
      ? `Files for task ${taskId}`
      : 'Files';

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '80vw', maxWidth: 900, maxHeight: '80vh' }}>
        <ModalClose />
        <Typography level="h4" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            mb: 1,
          }}
        >
          <Input
            size="sm"
            placeholder="Filter files by name or path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {hasGithub && (
              <Chip
                size="sm"
                variant={showGithub ? 'solid' : 'outlined'}
                color="primary"
                onClick={() => setShowGithub((prev) => !prev)}
              >
                GitHub
              </Chip>
            )}
            {hasLocal && (
              <Chip
                size="sm"
                variant={showLocal ? 'solid' : 'outlined'}
                color="neutral"
                onClick={() => setShowLocal((prev) => !prev)}
              >
                Local
              </Chip>
            )}
          </Box>
        </Box>

        {error && (
          <Alert
            color="danger"
            variant="soft"
            sx={{ mb: 1, alignItems: 'center' }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: 1,
              }}
            >
              <Typography level="body-sm">
                Couldn&apos;t load files for this task.
              </Typography>
              <Chip
                size="sm"
                variant="outlined"
                onClick={() => mutate()}
                sx={{ cursor: 'pointer' }}
              >
                Retry
              </Chip>
            </Box>
          </Alert>
        )}

        <Sheet
          variant="outlined"
          sx={{
            mt: 1,
            flex: 1,
            overflow: 'auto',
            borderRadius: 'sm',
            minHeight: 200,
            maxHeight: '60vh',
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <CircularProgress size="sm" />
            </Box>
          ) : filteredFiles.length === 0 ? (
            <Box
              sx={{
                p: 2,
                textAlign: 'center',
              }}
            >
              <Typography level="body-sm" color="neutral">
                No files found for this task.
              </Typography>
            </Box>
          ) : (
            <List
              size="sm"
              sx={{
                py: 0.5,
              }}
            >
              {filteredFiles.map((entry, idx) => (
                <ListItem key={`${entry.source}-${entry.path}-${idx}`}>
                  <ListItemDecorator>
                    <FileIcon size={16} />
                  </ListItemDecorator>
                  <ListItemContent>
                    <Typography
                      level="body-sm"
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      <Box
                        component="span"
                        sx={{
                          px: 0.75,
                          py: 0.25,
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          bgcolor:
                            entry.source === 'github'
                              ? 'primary.solidBg'
                              : 'neutral.solidBg',
                          color:
                            entry.source === 'github'
                              ? 'primary.solidColor'
                              : 'neutral.solidColor',
                          flexShrink: 0,
                        }}
                      >
                        {entry.source === 'github' ? 'GitHub' : 'Local'}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                      >
                        {entry.path}
                      </Box>
                    </Typography>
                  </ListItemContent>
                </ListItem>
              ))}
            </List>
          )}
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}

