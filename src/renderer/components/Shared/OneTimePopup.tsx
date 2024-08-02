import {
  Button,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';

export default function OneTimePopup({ title, children }) {
  const [open, setOpen] = useState(true);

  const localStorageKey = 'oneTimePopup' + '#' + title;

  // Check Local Storage if this popup has been shown before:
  useEffect(() => {
    const hasShownBefore = localStorage.getItem(localStorageKey);
    if (hasShownBefore) {
      setOpen(false);
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
          sx={{ width: '50vw', maxHeight: '100%', overflowY: 'hidden' }}
        >
          <ModalClose />
          <DialogTitle>{title}</DialogTitle>
          <DialogContent sx={{ pt: 2, overflowY: 'auto', overflowX: 'hidden' }}>
            {children}
          </DialogContent>{' '}
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
