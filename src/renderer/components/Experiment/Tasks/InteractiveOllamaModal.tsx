import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { LogsIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

type InteractiveOllamaModalProps = {
  jobId: number;
  setJobId: (jobId: number) => void;
  onOpenOutput?: (jobId: number) => void;
};

export default function InteractiveOllamaModal({
  jobId,
  setJobId,
  onOpenOutput,
}: InteractiveOllamaModalProps) {
  const { experimentInfo } = useExperimentInfo();

  const url = React.useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobId),
    );
  }, [experimentInfo?.id, jobId]);

  const {
    data,
    isLoading,
    error,
  }: {
    data: any;
    isLoading: boolean;
    error: any;
  } = useSWR(url, fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });

  const handleClose = () => {
    setJobId(-1);
  };

  const handleCopy = (text: string | undefined | null) => {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore copy failures
    }
  };

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const ollamaUrl = data?.ollama_url || null;
  const tunnelUrl = data?.tunnel_url || null;
  const openwebuiUrl = data?.openwebui_url || null;
  const isReady = Boolean(data?.is_ready);

  return (
    <Modal open={jobId !== -1} onClose={handleClose}>
      <ModalDialog
        sx={{
          maxWidth: '700px',
          width: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <Stack spacing={1} sx={{ mb: 1 }}>
          <Typography level="title-lg">
            Ollama Server Interactive Session (Job {jobId})
          </Typography>
          <Typography level="body-sm" color="neutral">
            Access your Ollama API server through the tunnel URL below. The
            tunnel URL provides secure access to the Ollama OpenAI-compatible
            API.
          </Typography>
        </Stack>
        <Divider />
        <Box
          sx={{
            mt: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip color={isReady ? 'success' : 'warning'} variant="soft">
              {isReady ? 'Ready' : 'Waiting for tunnel'}
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
            {error && (
              <Typography level="body-xs" color="danger">
                Failed to load tunnel info
              </Typography>
            )}
          </Stack>

          <Box>
            <Typography level="title-md">Access Ollama API Server</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              Once the tunnel is ready, use the URL below to access your Ollama
              server. The Ollama server provides an OpenAI-compatible API
              endpoint.
            </Typography>

            <Box
              sx={{
                mt: 1,
                p: 1.5,
                borderRadius: 'sm',
                border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {ollamaUrl ? (
                <>
                  <Link
                    href={ollamaUrl}
                    target="_blank"
                    rel="noreferrer"
                    level="title-md"
                    sx={{ wordBreak: 'break-all', flex: 1, minWidth: 0 }}
                  >
                    {ollamaUrl}
                  </Link>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => handleCopy(ollamaUrl)}
                    >
                      Copy URL
                    </Button>
                  </Stack>
                </>
              ) : (
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  Waiting for tunnel to start. The URL will appear here once
                  ngrok creates the tunnel...
                </Typography>
              )}
            </Box>

            {ollamaUrl && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
                  API Usage Example:
                </Typography>
                <Typography
                  level="body-xs"
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    fontSize: '0.75rem',
                  }}
                >
                  {`curl ${ollamaUrl}/api/generate -d '{
  "model": "your-model-name",
  "prompt": "Why is the sky blue?",
  "stream": false
}'`}
                </Typography>
              </Box>
            )}

            <Typography level="body-xs" sx={{ mt: 1 }}>
              Tip: If the URL never appears, check the job output and provider
              logs to ensure Ollama and ngrok started correctly.
            </Typography>
          </Box>

          <Box>
            <Typography level="title-md" sx={{ mt: 2 }}>
              Access Open WebUI
            </Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              Once the second tunnel is ready, use the URL below to open Open
              WebUI connected to this Ollama server. This gives you a convenient
              browser chat UI backed by the same Ollama API.
            </Typography>

            <Box
              sx={{
                mt: 1,
                p: 1.5,
                borderRadius: 'sm',
                border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {openwebuiUrl ? (
                <>
                  <Link
                    href={openwebuiUrl}
                    target="_blank"
                    rel="noreferrer"
                    level="title-md"
                    sx={{ wordBreak: 'break-all', flex: 1, minWidth: 0 }}
                  >
                    {openwebuiUrl}
                  </Link>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => handleCopy(openwebuiUrl)}
                    >
                      Copy URL
                    </Button>
                  </Stack>
                </>
              ) : (
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  Waiting for the second tunnel to start. The Open WebUI URL
                  will appear here once ngrok creates the tunnel...
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
