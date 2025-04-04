import { useEffect, useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  DialogTitle,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { RotateCcwIcon } from 'lucide-react';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TensorboardModal({
  currentTensorboard,
  setCurrentTensorboard,
}) {
  const [iframeReady, setIframeReady] = useState(false);

  var currentServerURL = window.TransformerLab.API_URL;
  // If there is a port number, remove it:
  currentServerURL = currentServerURL.replace(/:[0-9]+\/$/, '');

  useEffect(() => {
    const asyncFunction = async () => {
      if (currentTensorboard !== -1) {
        console.log('starting tensorboard');
        var job_id = currentTensorboard;
        setIframeReady(false);

        await fetch(
          chatAPI.API_URL() + 'train/tensorboard/start?job_id=' + job_id,
        );

        for (let i = 0; i < 8; i++) {
          console.log('checking if tensorboard is ready - ' + i);
          // Wait three seconds (to give tensorboard time to start) before showing the iframe
          await new Promise((r) => setTimeout(r, 3000));

          try {
            const mode =
              window?.platform?.appmode === 'cloud' ? 'no-cors' : 'cors';
            // eslint-disable-next-line no-await-in-loop
            const tensorboardIsReady = await fetch(
              `${currentServerURL}:6006/`,
              {
                mode,
              },
            );
            if (
              tensorboardIsReady.status === 200 ||
              tensorboardIsReady.status === 0
            ) {
              // See https://github.com/whatwg/fetch/issues/1140 for why we check for 0
              // Basically no-cors will will not allow us to see the status code
              setIframeReady(true);
              break;
            } else {
              console.log('tensorboard not ready yet');
            }
          } catch (e) {
            console.error(e);
            continue;
          }
        }
      }

      if (currentTensorboard == -1) {
        console.log('stopping tensorboard');
        fetcher(chatAPI.API_URL() + 'train/tensorboard/stop').then((res) => {
          console.log(res);
        });
      }
    };

    asyncFunction().catch((e) => console.error(e));
  }, [currentTensorboard]);

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
