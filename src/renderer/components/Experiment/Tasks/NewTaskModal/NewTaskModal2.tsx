import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import {
  ModalClose,
  ModalDialog,
  Divider,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Input,
  Stack,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  Typography,
  Chip,
  Box,
} from '@mui/joy';
import { PlayIcon, SearchIcon } from 'lucide-react';
import JSZip from 'jszip';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { chunkedUpload, deleteUpload } from '../../../../lib/chunkedUpload';
import TaskDirectoryUploader from './TaskDirectoryUploader';

type NewTaskModal2Props = {
  open: boolean;
  onClose: () => void;
  experimentId: string;
  onTaskCreated: (taskId: string) => void;
  title?: string;
};

const defaultTitle = 'Add New Task';

export default function NewTaskModal2({
  open,
  onClose,
  experimentId,
  onTaskCreated,
  title = defaultTitle,
}: NewTaskModal2Props) {
  const [selectedOption, setSelectedOption] = React.useState<string>('git');
  const [gitUrl, setGitUrl] = React.useState<string>('');
  const [gitRepoDirectory, setGitRepoDirectory] = React.useState<string>('');
  const [gitBranch, setGitBranch] = React.useState<string>('');
  const [directoryFiles, setDirectoryFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [showCreateBlank, setShowCreateBlank] = React.useState(false);
  const [creatingBlank, setCreatingBlank] = React.useState(false);
  const [creatingBlankTask, setCreatingBlankTask] = React.useState(false);
  const [gallerySearch, setGallerySearch] = React.useState('');
  const [selectedGalleryItem, setSelectedGalleryItem] = React.useState<{
    identifier: string | number;
    source: 'global' | 'team';
  } | null>(null);

  const { data: galleryData } = useSWR(
    selectedOption === 'gallery' && experimentId
      ? chatAPI.Endpoints.Task.Gallery(experimentId)
      : null,
    fetcher,
  );
  const { data: teamGalleryData } = useSWR(
    selectedOption === 'gallery' && experimentId
      ? chatAPI.Endpoints.Task.TeamGallery(experimentId)
      : null,
    fetcher,
  );

  const globalGallery: any[] = galleryData?.data || [];
  const teamGallery: any[] = (teamGalleryData?.data || []).filter(
    (e: any) =>
      !(e?.subtype === 'interactive' || e?.config?.subtype === 'interactive'),
  );

  const allGalleryItems = [
    ...globalGallery.map((t: any, i: number) => ({
      task: t,
      identifier: t?.id || t?.title || i,
      source: 'global' as const,
    })),
    ...teamGallery.map((t: any, i: number) => ({
      task: t,
      identifier: t?.id || t?.title || i,
      source: 'team' as const,
    })),
  ];

  const filteredGalleryItems = allGalleryItems.filter(({ task }) => {
    const q = gallerySearch.toLowerCase();
    if (!q) return true;
    const title = (task.title || task.name || '').toLowerCase();
    const desc = (task.description || '').toLowerCase();
    return title.includes(q) || desc.includes(q);
  });

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setShowCreateBlank(false);
      setSubmitError(null);
      setCreatingBlank(false);
      setCreatingBlankTask(false);
      setSelectedGalleryItem(null);
      setGallerySearch('');
    }
  }, [open]);

  const handleSubmit = async (createIfMissing = false) => {
    setSubmitError(null);
    setShowCreateBlank(false);
    if (selectedOption === 'gallery') {
      if (!selectedGalleryItem) {
        setSubmitError('Please select a task from the gallery.');
        return;
      }
      setSubmitting(true);
      try {
        const endpoint =
          selectedGalleryItem.source === 'team'
            ? chatAPI.Endpoints.Task.ImportFromTeamGallery(experimentId)
            : chatAPI.Endpoints.Task.ImportFromGallery(experimentId);
        const response = await chatAPI.authenticatedFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gallery_id: selectedGalleryItem.identifier.toString(),
            experiment_id: experimentId,
            is_interactive: false,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setSubmitError(err.detail || `Request failed: ${response.status}`);
          return;
        }
        const data = await response.json();
        onTaskCreated(data.id);
        onClose();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Import failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (selectedOption === 'blank') {
      setCreatingBlankTask(true);
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.BlankFromYaml(experimentId),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'blank' }),
          },
        );
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          setSubmitError(errText || `Request failed: ${response.status}`);
          return;
        }
        const data = await response.json();
        onTaskCreated(data.id);
        onClose();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setCreatingBlankTask(false);
      }
      return;
    }
    if (selectedOption === 'git') {
      const url = gitUrl.trim();
      if (!url) {
        setSubmitError('Git repository URL is required.');
        return;
      }
      setSubmitting(true);
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.FromDirectory(experimentId),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              github_repo_url: url,
              github_repo_dir: gitRepoDirectory.trim() || undefined,
              github_repo_branch: gitBranch.trim() || undefined,
              create_if_missing: createIfMissing,
            }),
          },
        );
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const errorDetail =
            err.detail || `Request failed: ${response.status}`;
          // Check if it's a task.yaml not found error
          if (
            response.status === 404 &&
            errorDetail.includes('task.yaml not found')
          ) {
            setShowCreateBlank(true);
            setSubmitError(errorDetail);
            return;
          }
          setSubmitError(errorDetail);
          return;
        }
        const data = await response.json();
        onTaskCreated(data.id);
        onClose();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (directoryFiles.length === 0) {
      setSubmitError('Select a directory that contains task.yaml.');
      return;
    }
    setSubmitting(true);
    try {
      const zip = new JSZip();
      const addFile = async (file: File) => {
        const path = file.webkitRelativePath || file.name;
        const blob = await file.arrayBuffer();
        zip.file(path, blob);
      };
      await Promise.all(directoryFiles.map(addFile));
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      setUploadProgress(0);
      const { upload_id } = await chunkedUpload({
        file: zipBlob,
        filename: 'directory.zip',
        onProgress: setUploadProgress,
      });

      let response: Response;
      try {
        response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.FromDirectory(experimentId) +
            `?upload_id=${upload_id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        );
      } catch (e) {
        await deleteUpload(upload_id).catch(() => {});
        throw e;
      }

      if (!response.ok) {
        await deleteUpload(upload_id).catch(() => {});
        const err = await response.json().catch(() => ({}));
        setSubmitError(err.detail || `Request failed: ${response.status}`);
        return;
      }
      await deleteUpload(upload_id).catch(() => {});
      const data = await response.json();
      onTaskCreated(data.id);
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <FormControl sx={{ overflow: 'hidden' }}>
              <FormLabel>Choose how to add a new task:</FormLabel>
              <RadioGroup
                value={selectedOption}
                onChange={(e) => {
                  setSelectedOption(e.target.value);
                  setSubmitError(null);
                  setShowCreateBlank(false);
                  setSelectedGalleryItem(null);
                  setGallerySearch('');
                }}
                sx={{ gap: 2, mt: 1 }}
              >
                <Stack spacing={1}>
                  <Radio value="git" label="From GitHub" />
                  {selectedOption === 'git' && (
                    <Stack spacing={1} sx={{ ml: 3 }}>
                      <Input
                        placeholder="https://github.com/username/repository.git"
                        value={gitUrl}
                        onChange={(e) => {
                          setGitUrl(e.target.value);
                          setShowCreateBlank(false);
                          setSubmitError(null);
                        }}
                      />
                      <Input
                        placeholder="Optional: subdirectory (e.g. tasks/my-task)"
                        value={gitRepoDirectory}
                        onChange={(e) => setGitRepoDirectory(e.target.value)}
                      />
                      <Input
                        placeholder="Optional: branch, tag, or commit (default branch if empty)"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                      />
                    </Stack>
                  )}
                </Stack>
                <Radio value="upload" label="Upload from your Computer" />
                <Radio value="blank" label="Start with a blank task template" />
                <Radio value="gallery" label="Import from Tasks Gallery" />
              </RadioGroup>
            </FormControl>

            {selectedOption === 'upload' && (
              <TaskDirectoryUploader
                onUpload={(files: File[]) => setDirectoryFiles(files)}
              />
            )}

            {selectedOption === 'gallery' && (
              <Stack spacing={1}>
                <Input
                  placeholder="Search gallery tasks..."
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  startDecorator={<SearchIcon size={16} />}
                  size="sm"
                />
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 'sm',
                    maxHeight: 280,
                    overflow: 'auto',
                  }}
                >
                  {filteredGalleryItems.length === 0 && (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography level="body-sm" color="neutral">
                        {galleryData || teamGalleryData
                          ? 'No tasks match your search.'
                          : 'Loading gallery…'}
                      </Typography>
                    </Box>
                  )}
                  <List size="sm" sx={{ '--List-padding': '4px', gap: 0.5 }}>
                    {filteredGalleryItems.map(
                      ({ task, identifier, source }) => {
                        const title =
                          task.title || task.name || 'Untitled Task';
                        const desc = task.description || '';
                        const isSelected =
                          selectedGalleryItem?.identifier === identifier &&
                          selectedGalleryItem?.source === source;
                        return (
                          <ListItem key={`${source}-${identifier}`}>
                            <ListItemButton
                              selected={isSelected}
                              onClick={() =>
                                setSelectedGalleryItem({ identifier, source })
                              }
                              sx={{ borderRadius: 'sm', gap: 1 }}
                            >
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography
                                    level="title-sm"
                                    noWrap
                                    sx={{ flex: 1 }}
                                  >
                                    {title}
                                  </Typography>
                                  <Chip
                                    size="sm"
                                    variant="soft"
                                    color={
                                      source === 'team' ? 'primary' : 'neutral'
                                    }
                                  >
                                    {source === 'team' ? 'Team' : 'Global'}
                                  </Chip>
                                </Stack>
                                {desc && (
                                  <Typography
                                    level="body-xs"
                                    color="neutral"
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {desc}
                                  </Typography>
                                )}
                              </Box>
                            </ListItemButton>
                          </ListItem>
                        );
                      },
                    )}
                  </List>
                </Box>
              </Stack>
            )}

            {submitError && (
              <div>
                <div
                  style={{
                    color: 'var(--joy-palette-danger-500)',
                    fontSize: 14,
                    marginBottom: showCreateBlank ? 12 : 0,
                  }}
                >
                  {submitError}
                </div>
                {showCreateBlank && (
                  <div
                    style={{
                      padding: 12,
                      backgroundColor: 'var(--joy-palette-neutral-50)',
                      borderRadius: 8,
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={{
                        color: 'var(--joy-palette-neutral-700)',
                        fontSize: 14,
                        marginBottom: 12,
                      }}
                    >
                      task.yaml not found in the repository. Create a blank
                      task.yaml with a sample template?
                    </div>
                    <Button
                      color="primary"
                      variant="solid"
                      size="sm"
                      onClick={async () => {
                        setCreatingBlank(true);
                        await handleSubmit(true);
                        setCreatingBlank(false);
                      }}
                      loading={creatingBlank}
                      disabled={creatingBlank || submitting}
                    >
                      Create Blank
                    </Button>
                  </div>
                )}
              </div>
            )}
            {submitting && selectedOption === 'upload' && (
              <LinearProgress determinate value={uploadProgress} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            startDecorator={<PlayIcon />}
            color="success"
            onClick={() => handleSubmit(false)}
            loading={submitting || creatingBlankTask}
            disabled={
              creatingBlank ||
              creatingBlankTask ||
              (selectedOption === 'gallery' && !selectedGalleryItem)
            }
          >
            Create task
          </Button>
          <Button variant="plain" color="danger" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
