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
} from '@mui/joy';
import { PlayIcon } from 'lucide-react';
import JSZip from 'jszip';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
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
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [showCreateBlank, setShowCreateBlank] = React.useState(false);
  const [creatingBlank, setCreatingBlank] = React.useState(false);
  const [creatingBlankTask, setCreatingBlankTask] = React.useState(false);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setShowCreateBlank(false);
      setSubmitError(null);
      setCreatingBlank(false);
      setCreatingBlankTask(false);
    }
  }, [open]);

  const handleSubmit = async (createIfMissing = false) => {
    setSubmitError(null);
    setShowCreateBlank(false);
    if (selectedOption === 'blank') {
      setCreatingBlankTask(true);
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Task.BlankFromYaml(experimentId),
          {
            method: 'POST',
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
      const blob = await zip.generateAsync({ type: 'blob' });
      const formData = new FormData();
      formData.append('directory_zip', blob, 'directory.zip');

      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.FromDirectory(experimentId),
        {
          method: 'POST',
          body: formData,
        },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setSubmitError(err.detail || `Request failed: ${response.status}`);
        return;
      }
      const data = await response.json();
      onTaskCreated(data.id);
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
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
              </RadioGroup>
            </FormControl>

            {selectedOption === 'upload' && (
              <TaskDirectoryUploader
                onUpload={(files: File[]) => setDirectoryFiles(files)}
              />
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            startDecorator={<PlayIcon />}
            color="success"
            onClick={() => handleSubmit(false)}
            loading={submitting || creatingBlankTask}
            disabled={creatingBlank || creatingBlankTask}
          >
            Submit
          </Button>
          <Button variant="plain" color="danger" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

NewTaskModal2.defaultProps = { title: defaultTitle };
