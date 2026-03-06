import { useState, useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  ModalClose,
  Button,
  Stack,
  FormControl,
  FormLabel,
  Input,
  RadioGroup,
  Radio,
  Autocomplete,
  Box,
} from '@mui/joy';
import { Save } from 'lucide-react';

interface SaveToRegistryDialogProps {
  open: boolean;
  onClose: () => void;
  /** The original name from the job (used as default for "Save as new") */
  sourceName: string;
  /** 'dataset' or 'model' — used for labels */
  type: 'dataset' | 'model';
  /** List of existing registry entry names for the "Add to existing" option */
  existingNames: string[];
  /** Whether the save is in progress */
  saving: boolean;
  /** Called when the user confirms the save */
  onSave: (targetName: string, mode: 'new' | 'existing') => void;
}

export default function SaveToRegistryDialog({
  open,
  onClose,
  sourceName,
  type,
  existingNames,
  saving,
  onSave,
}: SaveToRegistryDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState(sourceName);
  const [existingTarget, setExistingTarget] = useState<string | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setMode('new');
      setNewName(sourceName);
      setExistingTarget(null);
    }
  }, [open, sourceName]);

  const typeLabel = type === 'dataset' ? 'Dataset' : 'Model';

  const canSave =
    mode === 'new'
      ? newName.trim().length > 0
      : existingTarget !== null && existingTarget.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    const targetName = mode === 'new' ? newName.trim() : existingTarget!;
    onSave(targetName, mode);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 480, maxWidth: '95vw' }}>
        <ModalClose />
        <Typography level="h4">Save {typeLabel} to Registry</Typography>
        <Typography level="body-sm" sx={{ mb: 2 }}>
          Choose how to publish <strong>{sourceName}</strong> to the{' '}
          {typeLabel.toLowerCase()} registry.
        </Typography>

        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as 'new' | 'existing')}
          sx={{ gap: 2 }}
        >
          {/* Option 1: Save as new */}
          <Box>
            <Radio value="new" label="Save as new" />
            {mode === 'new' && (
              <FormControl sx={{ ml: 4, mt: 1 }}>
                <FormLabel>{typeLabel} name</FormLabel>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`Enter a name for the new ${typeLabel.toLowerCase()}`}
                  autoFocus
                />
              </FormControl>
            )}
          </Box>

          {/* Option 2: Add to existing */}
          <Box>
            <Radio
              value="existing"
              label={`Add to existing ${typeLabel.toLowerCase()}`}
              disabled={existingNames.length === 0}
            />
            {mode === 'existing' && (
              <FormControl sx={{ ml: 4, mt: 1 }}>
                <FormLabel>Select existing {typeLabel.toLowerCase()}</FormLabel>
                <Autocomplete
                  options={existingNames}
                  value={existingTarget}
                  onChange={(_e, value) => setExistingTarget(value)}
                  placeholder={`Search ${typeLabel.toLowerCase()}s…`}
                  autoFocus
                />
              </FormControl>
            )}
          </Box>
        </RadioGroup>

        <Stack
          direction="row"
          justifyContent="flex-end"
          spacing={1}
          sx={{ mt: 3 }}
        >
          <Button
            variant="plain"
            color="neutral"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            startDecorator={<Save size={16} />}
            onClick={handleSubmit}
            loading={saving}
            disabled={!canSave}
          >
            {mode === 'new' ? 'Save as New' : 'Merge into Existing'}
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
