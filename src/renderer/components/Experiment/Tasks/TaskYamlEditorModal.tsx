import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import { ModalClose, ModalDialog, Divider } from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { setTheme, getMonacoEditorOptions } from 'renderer/lib/monacoConfig';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

type TaskYamlEditorModalProps = {
  open: boolean;
  onClose: () => void;
  experimentId: string;
  taskId: string;
  onSaved?: () => void;
};

export default function TaskYamlEditorModal({
  open,
  onClose,
  experimentId,
  taskId,
  onSaved,
}: TaskYamlEditorModalProps) {
  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadYaml = React.useCallback(async () => {
    if (!experimentId || !taskId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.GetYaml(experimentId, taskId),
      );
      if (!response.ok) {
        if (response.status === 404) {
          setContent('');
        } else {
          setError(`Failed to load: ${response.status}`);
        }
        return;
      }
      const text = await response.text();
      setContent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load task.yaml');
    } finally {
      setLoading(false);
    }
  }, [experimentId, taskId]);

  React.useEffect(() => {
    if (open && experimentId && taskId) {
      loadYaml();
    }
  }, [open, experimentId, taskId, loadYaml]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.UpdateYaml(experimentId, taskId),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: content,
        },
      );
      if (!response.ok) {
        setError(`Failed to save: ${response.status}`);
        return;
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 900,
          width: '95vw',
          height: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <DialogTitle>task.yaml</DialogTitle>
        <Divider />
        <DialogContent sx={{ flex: 1, minHeight: 0, p: 0 }}>
          {loading ? (
            <div style={{ padding: 16 }}>Loading...</div>
          ) : error ? (
            <div
              style={{ padding: 16, color: 'var(--joy-palette-danger-500)' }}
            >
              {error}
            </div>
          ) : (
            <Editor
              height="100%"
              language="yaml"
              value={content}
              onChange={(v) => setContent(v ?? '')}
              onMount={(editor, monaco) => {
                setTheme(editor, monaco);
              }}
              options={getMonacoEditorOptions()}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="neutral" variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="success"
            onClick={handleSave}
            loading={saving}
            disabled={loading}
          >
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
