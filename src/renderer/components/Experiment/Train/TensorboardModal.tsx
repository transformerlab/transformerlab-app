import { useEffect, useState } from 'react';
import { Modal, ModalDialog, ModalClose, CircularProgress } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TensorboardModal({ open, setOpen }) {
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => {
    if (open) {
      console.log('starting tensorboard');
      fetcher(chatAPI.API_URL() + 'train/tensorboard/start').then((res) => {
        console.log(res);
      });

      // Wait three secondes (to give tensorboard time to start) before showing the iframe
      setIframeReady(false);

      setTimeout(() => {
        setIframeReady(true);
      }, 3000);
    }

    if (!open) {
      console.log('stopping tensorboard');
      fetcher(chatAPI.API_URL() + 'train/tensorboard/stop').then((res) => {
        console.log(res);
      });
    }
  }, [open]);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog
        sx={{
          height: '80vh',
          width: '80vw',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ModalClose />
        {iframeReady ? (
          <iframe
            id="tensorboard"
            src={`http://pop-os:6006/`}
            title="api docs"
            style={{
              border: '1px solid black',
              display: 'flex',
              flex: 99,
              height: '100%',
              width: '100%',
            }}
          />
        ) : (
          <>
            <CircularProgress />
            Waiting for tensorboard to start...
          </>
        )}
      </ModalDialog>
    </Modal>
  );
}
