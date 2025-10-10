import { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  DialogTitle,
  IconButton,
  Input,
  Box,
  Typography,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { RotateCcwIcon, PencilIcon, CheckIcon, XIcon } from 'lucide-react';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

export default function TensorboardModal({
  currentTensorboard,
  setCurrentTensorboard,
}) {
  const [iframeReady, setIframeReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [tensorboardUrl, setTensorboardUrl] = useState('');

  let currentServerURL = window.TransformerLab.API_URL;
  // If there is a port number, remove it:
  currentServerURL = currentServerURL.replace(/:[0-9]+\/$/, '');

  // Get the storage key for this API URL
  const getStorageKey = useCallback(
    () => `TENSORBOARD.${chatAPI.API_URL()}`,
    [],
  );

  // Load the effective Tensorboard URL (custom or default)
  const loadTensorboardUrl = useCallback(async () => {
    const storedUrl = await window.storage?.get(getStorageKey());
    const effectiveUrl = storedUrl || `${currentServerURL}:6006/`;
    setTensorboardUrl(effectiveUrl);
    return effectiveUrl;
  }, [currentServerURL, getStorageKey]);

  // Save custom URL to window.storage
  const saveCustomUrl = async () => {
    if (customUrl.trim()) {
      await window.storage?.set(getStorageKey(), customUrl.trim());
      setTensorboardUrl(customUrl.trim());
    } else {
      await window.storage?.delete(getStorageKey());
      const defaultUrl = `${currentServerURL}:6006/`;
      setTensorboardUrl(defaultUrl);
    }
    setIsEditing(false);
  };

  // Cancel editing
  const cancelEdit = () => {
    setCustomUrl(tensorboardUrl);
    setIsEditing(false);
  };

  // Reset to default URL
  const resetToDefault = async () => {
    await window.storage?.delete(getStorageKey());
    const defaultUrl = `${currentServerURL}:6006/`;
    setTensorboardUrl(defaultUrl);
    setCustomUrl(defaultUrl);
  };

  // Initialize URLs on component mount
  useEffect(() => {
    loadTensorboardUrl().then((url) => {
      setCustomUrl(url);
    });
  }, [loadTensorboardUrl]);

  useEffect(() => {
    const asyncFunction = async () => {
      if (currentTensorboard !== -1) {
        console.log('starting tensorboard');
        var job_id = currentTensorboard;
        setIframeReady(false);

        await chatAPI.authenticatedFetch(
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
            const tensorboardIsReady = await chatAPI.authenticatedFetch(
              tensorboardUrl as any,
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
  }, [currentTensorboard, tensorboardUrl]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {isEditing ? (
            <>
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Enter Tensorboard URL"
                sx={{ flex: 1 }}
              />
              <IconButton size="sm" onClick={saveCustomUrl} color="success">
                <CheckIcon size={16} />
              </IconButton>
              <IconButton size="sm" onClick={cancelEdit} color="neutral">
                <XIcon size={16} />
              </IconButton>
            </>
          ) : (
            <>
              <Typography level="body-sm" sx={{ flex: 1 }}>
                {tensorboardUrl}
              </Typography>
              <IconButton
                size="sm"
                onClick={() => setIsEditing(true)}
                color="neutral"
                variant="outlined"
                title="Set custom Tensorboard URL if port 6006 is exposed on another URL"
              >
                <PencilIcon size={16} />
              </IconButton>
              <IconButton
                size="sm"
                onClick={resetToDefault}
                color="warning"
                variant="outlined"
                title="Reset to default URL"
              >
                <RotateCcwIcon size={16} />
              </IconButton>
            </>
          )}
        </Box>
        {iframeReady ? (
          <iframe
            id="tensorboard"
            src={tensorboardUrl}
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
