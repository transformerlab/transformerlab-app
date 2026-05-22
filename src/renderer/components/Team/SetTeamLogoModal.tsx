import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void> | void;
};

export default function SetTeamLogoModal({
  open,
  onClose,
  onSave,
}: Props): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  function resetAndClose() {
    setFile(null);
    setPreview(null);
    onClose();
  }

  async function handleSave() {
    if (!file) return;
    setUploading(true);
    try {
      await onSave(file);
      setFile(null);
      setPreview(null);
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setFile(null);
        setPreview(null);
        onClose();
      }}
    >
      <ModalDialog aria-labelledby="set-logo-title" sx={{ minWidth: 320 }}>
        <ModalClose />
        <Typography id="set-logo-title" level="h4">
          Set Team Logo
        </Typography>

        <Box sx={{ mt: 2 }}>
          <FormControl>
            <FormLabel>Team Logo</FormLabel>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {preview && (
                <Box
                  component="img"
                  src={preview}
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
                disabled={uploading}
              >
                {preview ? 'Change Logo' : 'Upload Logo'}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e: any) => {
                    const picked = e.target.files?.[0];
                    if (picked) {
                      setFile(picked);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setPreview(reader.result as string);
                      };
                      reader.readAsDataURL(picked);
                    }
                  }}
                />
              </Button>
              {preview && (
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  disabled={uploading}
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
          <Button variant="plain" onClick={resetAndClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Save'}
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
