import * as React from 'react';
import Sheet from '@mui/joy/Sheet';
import {
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Switch,
  Typography,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { DownloadIcon } from 'lucide-react';
import { useNotification } from '../Shared/NotificationSystem';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';

export default function TransformerLabSettings() {
  const [doNotTrack, setDoNotTrack] = React.useState(false);
  const { addNotification } = useNotification();

  React.useEffect(() => {
    const fetchDoNotTrack = async () => {
      const value = await window.storage.get('DO_NOT_TRACK');
      setDoNotTrack(value === 'true');
    };
    fetchDoNotTrack();
  }, []);

  const handleDoNotTrackChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const checked = event.target.checked;
    setDoNotTrack(checked);
    window.storage.set('DO_NOT_TRACK', checked.toString());
  };

  return (
    <Sheet
      sx={{
        width: '100%',
        height: '100%',
        overflowY: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1" marginBottom={1}>
        Transformer Lab Settings
      </Typography>
      <Sheet
        sx={{
          height: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <FormControl sx={{ mt: 2 }}>
          <FormLabel>Do Not Share Any Data</FormLabel>
          <Switch
            checked={doNotTrack}
            onChange={handleDoNotTrackChange}
            color={doNotTrack ? 'success' : 'neutral'}
            sx={{ alignSelf: 'flex-start' }}
          />
          <FormHelperText>
            {doNotTrack
              ? 'No tracking events will be sent'
              : 'Anonymous usage data will be shared with Transformer Lab'}
            . Restart app to apply changes.
          </FormHelperText>
        </FormControl>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Button
          variant="soft"
          startDecorator={<DownloadIcon />}
          onClick={async () => {
            try {
              const response = await chatAPI.authenticatedFetch(
                getAPIFullPath('server', ['download_logs'], {}),
              );

              if (!response.ok) {
                // Check if it's a 404 (no log files)
                if (response.status === 404) {
                  const errorData = await response.json();
                  addNotification({
                    type: 'warning',
                    message:
                      errorData.detail ||
                      'No log files found. The log files may not have been created yet.',
                  });
                  return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');

              // Get filename from Content-Disposition header or use default
              const contentDisposition = response.headers.get(
                'Content-Disposition',
              );
              let filename = 'transformerlab_logs.zip';
              if (contentDisposition) {
                const filenameMatch =
                  contentDisposition.match(/filename="?(.+?)"?$/i);
                if (filenameMatch) {
                  filename = filenameMatch[1];
                }
              }

              link.download = filename;
              link.href = url;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);

              addNotification({
                type: 'success',
                message: 'API logs downloaded successfully',
              });
            } catch (error: any) {
              console.error('Error downloading logs:', error);
              addNotification({
                type: 'danger',
                message: `Failed to download logs: ${error.message}`,
              });
            }
          }}
          sx={{ mt: 2 }}
        >
          Download API Logs
        </Button>
      </Sheet>
    </Sheet>
  );
}

