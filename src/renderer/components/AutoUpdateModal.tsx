import React, { useEffect } from 'react';

import { Modal, ModalClose, Sheet, Typography } from '@mui/joy';
import HexLogoSpinner from './Shared/HexLogoSpinner';

export default function AutoUpdateModal({ }) {
  const [open, setOpen] = React.useState<boolean>(true);
  const [message, setMessage] = React.useState<string>('Looking for updates');

  useEffect(() => {
    window.autoUpdater.requestUpdate();
    window.autoUpdater.onMessage((event, message) => {
      setMessage(message);

      if (message === 'Update not available.') {
        setOpen(false);
      }

      if (message === 'Update error') {
        setTimeout(() => {
          setOpen(false);
        }, 2000);
      }
    });

    return () => {
      window.autoUpdater.removeAllListeners();
    };
  }, []);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 500,
          borderRadius: 'md',
          p: 3,
          boxShadow: 'lg',
          textAlign: 'center',
        }}
      >
        <ModalClose />
        <Typography level="h4" sx={{ mb: 4 }}>
          Auto Update
        </Typography>
        <Typography textColor="text.tertiary">
          {/* {message} */}
          <HexLogoSpinner />
          {message === 'Checking for update...' && <>Checking for Updates...</>}
          {message === 'Update available' && (
            <>Update Available, Downloading...</>
          )}
          {message.startsWith('Download speed') && (
            <>
              Update Available, Downloading...
              <br />
              {message}
            </>
          )}
          {message === 'Downloading update...' && <>Downloading Updates...</>}
          {message === 'Update not available.' && <>Update not available.</>}
          {message === 'Update error' && <>Auto Update Error</>}
        </Typography>
        <Typography level="body-sm" sx={{ mt: 1 }}>
          Please note that auto update does not currently work on Windows --
          please download the app from our website to update.
        </Typography>
      </Sheet>
    </Modal>
  );
}
