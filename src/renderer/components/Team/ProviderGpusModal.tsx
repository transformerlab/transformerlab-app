import {
  Alert,
  Box,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Table,
  Typography,
} from '@mui/joy';
import { useAPI } from 'renderer/lib/authContext';

interface GpuInfo {
  gpu: string;
  count: number;
}

interface ProviderGpusModalProps {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName?: string;
}

/**
 * Read-only modal listing the GPUs available on a provider. Shows live
 * availability where the provider can report it, otherwise its catalog of
 * launchable GPU types. Data comes from GET
 * /compute_provider/providers/{providerId}/gpus.
 */
export default function ProviderGpusModal({
  open,
  onClose,
  providerId,
  providerName,
}: ProviderGpusModalProps) {
  // Only fetch while open and with a provider selected (null params skip SWR).
  const { data, error, isLoading } = useAPI('compute_provider', ['gpus'], {
    providerId: open && providerId ? providerId : null,
  });

  const gpus: GpuInfo[] = Array.isArray(data?.gpus) ? data.gpus : [];
  const failed = Boolean(error) || data?.status === 'error';
  const title = providerName
    ? `Available GPUs — ${providerName}`
    : 'Available GPUs';

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 520, maxWidth: '95vw' }}>
        <ModalClose />
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Typography level="body-sm" sx={{ mb: 1.5 }}>
            Live availability where the provider reports it, otherwise the
            catalog of GPU types it can launch.
          </Typography>

          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                py: 4,
              }}
            >
              <CircularProgress />
            </Box>
          ) : failed ? (
            <Alert color="danger" variant="soft">
              Failed to load GPUs for this provider.
            </Alert>
          ) : gpus.length === 0 ? (
            <Alert color="neutral" variant="soft">
              No GPU information available for this provider.
            </Alert>
          ) : (
            <Table size="sm" stripe="odd">
              <thead>
                <tr>
                  <th>GPU</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {gpus.map((g) => (
                  <tr key={g.gpu}>
                    <td>{g.gpu}</td>
                    <td style={{ textAlign: 'right' }}>{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

ProviderGpusModal.defaultProps = {
  providerName: undefined,
};
