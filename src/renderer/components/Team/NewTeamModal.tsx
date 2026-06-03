import {
  Alert,
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, logoFile: File | null) => Promise<void> | void;
};

export default function NewTeamModal({
  open,
  onClose,
  onCreate,
}: Props): JSX.Element {
  const [name, setName] = useState<string>('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  function resetAndClose() {
    setName('');
    setLogoFile(null);
    setLogoPreview(null);
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name, logoFile);
      setName('');
      setLogoFile(null);
      setLogoPreview(null);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to create team. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setLogoFile(null);
        setLogoPreview(null);
        onClose();
      }}
    >
      <ModalDialog aria-labelledby="new-team-title" sx={{ minWidth: 320 }}>
        <ModalClose />
        <Typography id="new-team-title" level="h4">
          New Team
        </Typography>

        {error && (
          <Alert color="danger" variant="soft" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2 }}>
          <FormControl>
            <FormLabel>Team Name</FormLabel>
            <Input
              placeholder="Team name"
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              disabled={submitting}
              aria-label="New team name"
              size="sm"
              autoFocus
            />
          </FormControl>
        </Box>

        <Box sx={{ mt: 2 }}>
          <FormControl>
            <FormLabel>Team Logo (optional)</FormLabel>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {logoPreview && (
                <Box
                  component="img"
                  src={logoPreview}
                  alt="Logo preview"
                  sx={{
                    width: 64,
                    height: 64,
                    objectFit: 'contain',
                    borderRadius: 'sm',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
              )}
              <Button
                component="label"
                variant="outlined"
                size="sm"
                disabled={submitting}
              >
                {logoFile ? 'Change Logo' : 'Upload Logo'}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e: any) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setLogoPreview(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </Button>
              {logoFile && (
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                  }}
                  disabled={submitting}
                >
                  Remove
                </Button>
              )}
            </Box>
          </FormControl>
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            mt: 2,
          }}
        >
          <Button variant="plain" onClick={resetAndClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
