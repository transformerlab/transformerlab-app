import React from 'react';
import { Modal, ModalClose, Sheet, Typography } from '@mui/joy';

window.autoUpdater.onMessage((message: Node) => {
  // console.log('autoupdate message', message);
  const container = document.getElementById('messages') as HTMLDivElement;
  // const m = document.createElement('div');
  // m.innerHTML = text;
  container?.appendChild(message);
});

export default function AutoUpdateModal({}) {
  const [open, setOpen] = React.useState<boolean>(true);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: 500,
          borderRadius: 'md',
          p: 3,
          boxShadow: 'lg',
        }}
      >
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <Typography
          component="h2"
          id="modal-title"
          level="h4"
          textColor="inherit"
          fontWeight="lg"
          mb={1}
        >
          This is the modal title
        </Typography>
        <Typography id="modal-desc" textColor="text.tertiary">
          Make sure to use <code>aria-labelledby</code> on the modal dialog with
          an optional <code>aria-describedby</code> attribute.
          <div id="messages"></div>
        </Typography>
      </Sheet>
    </Modal>
  );
}
