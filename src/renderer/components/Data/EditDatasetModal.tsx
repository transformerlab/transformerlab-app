// EditDatasetModal.tsx
import React, { useState } from 'react';
import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
  Sheet,
  CircularProgress,
} from '@mui/joy';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

export default function EditDatasetModal({
  open,
  setOpen,
  dataset_id,
  onConfirm,
}) {
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setOpen(false);
    setNewName('');
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (newName.trim() === '') {
      alert('Please enter a new dataset name.');
      return;
    }

    setLoading(true); // Start loading spinner

    try {
      // Step 1: Duplicate the dataset
      const response = await fetch(
        chatAPI.Endpoints.Dataset.Duplicate(dataset_id, newName),
        { method: 'POST' },
      );
      const result = await response.json();

      if (result.status === 'error') {
        alert(`Error duplicating dataset: ${result.message}`);
        setLoading(false);
        return;
      }

      // Step 2: Poll the backend to confirm the new dataset is available
      let maxRetries = 10;
      let attempt = 0;
      let datasetConfirmed = false;

      while (attempt < maxRetries) {
        const checkResponse = await fetch(
          chatAPI.Endpoints.Dataset.Info(newName),
        );
        if (checkResponse.ok) {
          const datasetInfo = await checkResponse.json();
          if (datasetInfo?.features) {
            datasetConfirmed = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms
        attempt++;
      }

      if (!datasetConfirmed) {
        alert('Dataset copy confirmation timed out.');
        setLoading(false);
        return;
      }

      // Step 3: Notify parent (DatasetCard) to open preview for the new dataset
      onConfirm(newName.trim());
      handleClose();
    } catch (err) {
      alert(`Failed to duplicate dataset: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog>
        <ModalClose />
        <Typography level="title-lg">Edit Dataset</Typography>
        <Divider sx={{ my: 1 }} />
        <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography level="body-md" color="neutral">
            Datasets are immutable. In order to edit a dataset, a new copy must
            be created with the contents of this dataset.
          </Typography>
          <Typography level="body-md" color="neutral">
            Enter the name for the new Dataset:
          </Typography>
          {/* Form with Enter key submission support */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            <Input
              placeholder="New Dataset Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </form>
          <Typography
            level="body-xs"
            sx={{ fontStyle: 'italic', color: 'text.secondary' }}
          >
            Note: Parquet datasets are not editable.
          </Typography>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '1em' }}
          >
            <Button variant="plain" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            {loading ? (
              <CircularProgress />
            ) : (
              <Button variant="solid" onClick={handleConfirm}>
                OK
              </Button>
            )}
          </div>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
