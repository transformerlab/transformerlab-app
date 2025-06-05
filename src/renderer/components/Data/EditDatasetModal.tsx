import {
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  Box,
  Button,
} from '@mui/joy';
import DatasetPreviewEditImage from './DatasetPreviewEditImage';
import { useState, useCallback } from 'react';

export default function EditDatasetModal({
  datasetId,
  open,
  setOpen,
  template = 'default',
}) {
  const [modifiedRows, setModifiedRows] = useState(new Map());
  const [newDatasetId, setNewDatasetId] = useState('');
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Save edits logic
  const saveEditsWithName = useCallback(async () => {
    console.log('Saving dataset', newDatasetId, modifiedRows);
    setShowWarningModal(false);
    setOpen(false);
  }, [newDatasetId, modifiedRows, setOpen]);

  const handleDiscard = () => {
    setShowWarningModal(false);
    setOpen(false);
  };

  const handleCancel = () => {
    setShowWarningModal(false);
  };

  return (
    <>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4">
            Edit <b>{datasetId}</b>
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Sheet
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: '80vw',
              height: '80vh',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {alert(
                `Datasets are not editable in place.\n\nEdits you make here will be saved to a *new* dataset after clicking 'Save Changes'. This will copy the original dataset into a new one with your modifications.\n\nTo enable 'Save Changes', you must:\n1. Enter a new dataset name\n2. Make at least one change.`,
              ) || (
                <DatasetPreviewEditImage
                  datasetId={datasetId}
                  template={template}
                  onModifiedRowsChange={setModifiedRows}
                  onDatasetNameChange={setNewDatasetId}
                  onClose={() => setOpen(false)}
                />
              )}
            </Box>
          </Sheet>
        </ModalDialog>
      </Modal>

      {/* Custom Warning Modal */}
      <Modal open={showWarningModal}>
        <ModalDialog>
          <Typography level="h4">Unsaved Changes</Typography>
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ mb: 2 }}>
            You have unsaved changes. What would you like to do?
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button variant="solid" color="primary" onClick={saveEditsWithName}>
              OK (Save)
            </Button>
            <Button variant="soft" color="danger" onClick={handleDiscard}>
              Discard
            </Button>
            <Button variant="plain" onClick={handleCancel}>
              Cancel
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
}
