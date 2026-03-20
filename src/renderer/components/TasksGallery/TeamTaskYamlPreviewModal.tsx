import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import { ModalClose, ModalDialog, Divider } from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import { setTheme, getMonacoEditorOptions } from 'renderer/lib/monacoConfig';
import { Endpoints } from 'renderer/lib/transformerlab-api-sdk';
import { fetchWithAuth } from 'renderer/lib/authContext';

type TeamTaskYamlPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  experimentId: string;
  galleryId: string;
  title?: string | null;
};

export default function TeamTaskYamlPreviewModal({
  open,
  onClose,
  experimentId,
  galleryId,
  title,
}: TeamTaskYamlPreviewModalProps) {
  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadYaml = React.useCallback(async () => {
    if (!experimentId || !galleryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        Endpoints.Task.TeamGalleryGetFile(
          String(experimentId),
          String(galleryId),
          'task.yaml',
        ),
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Failed to load: ${res.status}`);
        setContent('');
        return;
      }
      const text = await res.text();
      setContent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load task.yaml');
      setContent('');
    } finally {
      setLoading(false);
    }
  }, [experimentId, galleryId]);

  React.useEffect(() => {
    if (open) {
      loadYaml();
    }
  }, [open, loadYaml]);

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
        <DialogTitle>task.yaml{title ? ` — ${title}` : ''}</DialogTitle>
        <Divider />
        <DialogContent sx={{ flex: 1, minHeight: 0, p: 0 }}>
          {loading ? (
            <div style={{ padding: 16 }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Failed to load task.yaml
              </div>
              <div style={{ color: 'var(--joy-palette-danger-500)' }}>
                {error}
              </div>
            </div>
          ) : (
            <Editor
              height="100%"
              language="yaml"
              value={content}
              onChange={() => {
                // Read-only preview
              }}
              onMount={(editor, monaco) => {
                setTheme(editor, monaco);
              }}
              options={{
                ...getMonacoEditorOptions(),
                readOnly: true,
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end' }}>
          <Button color="neutral" variant="plain" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
