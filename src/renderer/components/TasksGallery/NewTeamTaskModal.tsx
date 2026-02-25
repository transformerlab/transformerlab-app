import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import { FormHelperText, ModalClose, ModalDialog, Textarea } from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { useRef } from 'react';
import { useNotification } from '../Shared/NotificationSystem';
import { setTheme, getMonacoEditorOptions } from 'renderer/lib/monacoConfig';

type NewTeamTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    setup?: string;
    command: string;
    cpus?: string;
    memory?: string;
    supported_accelerators?: string;
    github_repo_url?: string;
    github_repo_dir?: string;
    github_repo_branch?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
};

export default function NewTeamTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: NewTeamTaskModalProps) {
  const { addNotification } = useNotification();

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [supportedAccelerators, setSupportedAccelerators] = React.useState('');
  const [setup, setSetup] = React.useState('');
  const [githubRepoUrl, setGithubRepoUrl] = React.useState('');
  const [githubRepoDir, setGithubRepoDir] = React.useState('');
  const [githubRepoBranch, setGithubRepoBranch] = React.useState('');
  // keep separate refs for the two Monaco editors
  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // read editor values (fallback to state if editor not mounted)
    const setupValue =
      setupEditorRef?.current?.getValue?.() ?? (setup || undefined);
    const commandValue =
      commandEditorRef?.current?.getValue?.() ?? (command || undefined);

    if (!title.trim()) {
      addNotification({ type: 'warning', message: 'Title is required' });
      return;
    }

    if (!commandValue || !commandValue.trim()) {
      addNotification({ type: 'warning', message: 'Command is required' });
      return;
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      setup: setupValue?.trim() || undefined,
      command: commandValue.trim(),
      cpus: cpus.trim() || undefined,
      memory: memory.trim() || undefined,
      supported_accelerators: supportedAccelerators.trim() || undefined,
      github_repo_url: githubRepoUrl.trim() || undefined,
      github_repo_dir: githubRepoDir.trim() || undefined,
      github_repo_branch: githubRepoBranch.trim() || undefined,
    });

    // Reset all form fields
    setTitle('');
    setDescription('');
    setCommand('');
    setCpus('');
    setMemory('');
    setSupportedAccelerators('');
    setSetup('');
    setGithubRepoUrl('');
    setGithubRepoDir('');
    setGithubRepoBranch('');
    // clear editor contents if mounted
    try {
      setupEditorRef?.current?.setValue?.('');
      commandEditorRef?.current?.setValue?.('');
    } catch (err) {
      // ignore
    }
    onClose();
  };

  function handleSetupEditorDidMount(editor: any, monaco: any) {
    setupEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  function handleCommandEditorDidMount(editor: any, monaco: any) {
    commandEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '70vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>Add Team Specific Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Description</FormLabel>
              <Textarea
                minRows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description (optional)"
              />
            </FormControl>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                marginTop: '16px',
              }}
            >
              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>CPUs</FormLabel>
                <Input
                  value={cpus}
                  onChange={(e) => setCpus(e.target.value)}
                  placeholder="e.g. 2"
                />
              </FormControl>

              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>Memory (in GB)</FormLabel>
                <Input
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  placeholder="e.g. 4"
                />
              </FormControl>

              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>Supported Accelerators</FormLabel>
                <Input
                  value={supportedAccelerators}
                  onChange={(e) => setSupportedAccelerators(e.target.value)}
                  placeholder="e.g. RTX3090:1 or H100:8"
                />
              </FormControl>
            </div>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Setup Command</FormLabel>
              <Editor
                defaultLanguage="shell"
                theme="my-theme"
                height="6rem"
                options={getMonacoEditorOptions({
                  fontSize: 18,
                  cursorStyle: 'block',
                  wordWrap: 'on',
                })}
                onMount={handleSetupEditorDidMount}
              />
              <FormHelperText>
                Optional setup commands that run before the task. e.g.{' '}
                <code>pip install -r requirements.txt</code>
              </FormHelperText>
            </FormControl>

            <FormControl required sx={{ mt: 2 }}>
              <FormLabel>Command</FormLabel>
              <Editor
                defaultLanguage="shell"
                theme="my-theme"
                height="8rem"
                options={getMonacoEditorOptions({
                  fontSize: 18,
                  cursorStyle: 'block',
                  wordWrap: 'on',
                })}
                onMount={handleCommandEditorDidMount}
              />
              <FormHelperText>
                The command to run. e.g.{' '}
                <code>python train.py --epochs 10</code>
              </FormHelperText>
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>GitHub Repository (Optional)</FormLabel>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>GitHub Repository URL</FormLabel>
                <Input
                  value={githubRepoUrl}
                  onChange={(e) => setGithubRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo.git"
                />
                <FormHelperText>
                  The GitHub repository URL to clone from
                </FormHelperText>
              </FormControl>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>Subdirectory (Optional)</FormLabel>
                <Input
                  value={githubRepoDir}
                  onChange={(e) => setGithubRepoDir(e.target.value)}
                  placeholder="path/to/directory"
                />
                <FormHelperText>
                  Optional: Specific directory within the repo. If empty, the
                  entire repo will be cloned.
                </FormHelperText>
              </FormControl>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>Branch / tag / commit (Optional)</FormLabel>
                <Input
                  value={githubRepoBranch}
                  onChange={(e) => setGithubRepoBranch(e.target.value)}
                  placeholder="main"
                />
                <FormHelperText>
                  Optional: Branch, tag, or commit SHA to clone. Defaults to
                  main if empty.
                </FormHelperText>
              </FormControl>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button
              variant="plain"
              color="neutral"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="solid" loading={isSubmitting}>
              Add Task
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
