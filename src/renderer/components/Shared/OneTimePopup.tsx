import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';

export default function OneTimePopup({ title, children }) {
  const [open, setOpen] = useState(false);

  const localStorageKey = 'oneTimePopup' + '#' + title;

  // Check Local Storage if this popup has been shown before:
  useEffect(() => {
    const hasShownBefore = localStorage.getItem(localStorageKey);
    if (!hasShownBefore) {
      setOpen(true);
    }
  }, []);

  function handleClose() {
    localStorage.setItem(localStorageKey, 'shown');
    setOpen(false);
  }

  return (
    <>
      <Modal open={open} onClose={() => handleClose()}>
        <ModalDialog
          variant="soft"
          sx={{
            minWidth: '25vw',
            maxWidth: '50vw',
            maxHeight: '100%',
            overflowY: 'hidden',
          }}
          color="warning"
        >
          <DialogTitle level="h2">💡&nbsp;{title}</DialogTitle>
          <DialogContent sx={{ pt: 2, overflowY: 'auto', overflowX: 'hidden' }}>
            <Typography level="body-md">{children}</Typography>
          </DialogContent>
          <Button
            sx={{ width: 'fit-content', alignSelf: 'flex-end', mt: 1 }}
            onClick={() => {
              handleClose();
            }}
          >
            Got it
          </Button>
        </ModalDialog>
      </Modal>
    </>
  );
}
