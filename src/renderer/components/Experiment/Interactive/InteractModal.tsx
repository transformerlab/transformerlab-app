import React from 'react';
import {
  CircularProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
  Chip,
  Box,
  Divider,
} from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface InteractModalProps {
  jobId: number;
  open: boolean;
  onClose: () => void;
}

export default function InteractModal({
  jobId,
  open,
  onClose,
}: InteractModalProps) {
  const { experimentInfo } = useExperimentInfo();

  const url = React.useMemo(() => {
    if (!open || !experimentInfo?.id) return null;
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobId),
    );
  }, [open, experimentInfo?.id, jobId]);

  const { data, isLoading } = useSWR(url, fetcher, {
    refreshInterval: 3000,
  });

  const isReady = Boolean(data?.is_ready);
  const values: Record<string, string> = data || {};

  const urls = Object.keys(values)
    .filter(
      (k) =>
        k.endsWith('_url') && typeof values[k] === 'string' && values[k],
    )
    .map((k) => ({
      label: k.replace(/_url$/, '').replace(/_/g, ' '),
      url: values[k],
    }));

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: '95vw',
          width: '95vw',
          height: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Interact (Job {jobId})
        </Typography>
        <Divider />
        {!isReady ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 2 }}
          >
            <Chip color="warning" variant="soft">
              Waiting for service to start
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
          </Stack>
        ) : urls.length === 0 ? (
          <Typography level="body-sm" sx={{ mt: 2 }}>
            No service URLs available for this job.
          </Typography>
        ) : (
          <Tabs
            defaultValue={0}
            sx={{ flex: 1, minHeight: 0, mt: 1, overflow: 'hidden' }}
          >
            <TabList>
              {urls.map(({ label }, i) => (
                <Tab key={label} value={i} sx={{ textTransform: 'capitalize' }}>
                  {label}
                </Tab>
              ))}
            </TabList>
            {urls.map(({ label, url: src }, i) => (
              <TabPanel
                key={label}
                value={i}
                sx={{ flex: 1, p: 0, overflow: 'hidden' }}
              >
                <Box
                  component="iframe"
                  src={src}
                  sx={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: 'sm',
                  }}
                />
              </TabPanel>
            ))}
          </Tabs>
        )}
      </ModalDialog>
    </Modal>
  );
}
