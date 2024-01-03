import { useEffect, useState } from 'react';
import { Modal, ModalDialog, ModalClose, CircularProgress } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TensorboardModal({
  currentTensorboard,
  setCurrentTensorboard,
}) {
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => {
    if (currentTensorboard !== -1) {
      console.log('starting tensorboard');
      var job_id = currentTensorboard;
      fetcher(
        chatAPI.API_URL() + 'train/tensorboard/start?job_id=' + job_id
      ).then((res) => {
        console.log(res);
      });

      // Wait three secondes (to give tensorboard time to start) before showing the iframe
      setIframeReady(false);

      setTimeout(() => {
        setIframeReady(true);
      }, 3000);
    }

    if (currentTensorboard == -1) {
      console.log('stopping tensorboard');
      fetcher(chatAPI.API_URL() + 'train/tensorboard/stop').then((res) => {
        console.log(res);
      });
    }
  }, [currentTensorboard]);

  var currentServerURL = window.TransformerLab.API_URL;
  // If there is a port number, remove it:
  currentServerURL = currentServerURL.replace(/:[0-9]+\/$/, '');

  return (
    <Modal
      open={currentTensorboard !== -1}
      onClose={() => setCurrentTensorboard(-1)}
    >
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
        {currentServerURL}:6006/
        {iframeReady ? (
          <iframe
            id="tensorboard"
            src={`${currentServerURL}:6006/`}
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
