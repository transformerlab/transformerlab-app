import React from 'react';
import {
  CircularProgress,
  DialogContent,
  IconButton,
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
import { RefreshCwIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

interface InteractModalProps {
  jobId: string | number | null;
  open: boolean;
  onClose: () => void;
}

export default function InteractIframeModal({
  jobId,
  open,
  onClose,
}: InteractModalProps) {
  const iframeRefs = React.useRef<Map<number, HTMLIFrameElement>>(new Map());
  const [activeTab, setActiveTab] = React.useState(0);
  const { experimentInfo } = useExperimentInfo();

  const url = React.useMemo(() => {
    if (!open || !experimentInfo?.id || jobId === null) return null;
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
      (k) => k.endsWith('_url') && typeof values[k] === 'string' && values[k],
    )
    .map((k) => ({
      label: k.replace(/_url$/, '').replace(/_/g, ' '),
      url: values[k],
    }));

  const handleRefresh = () => {
    const iframe = iframeRefs.current.get(activeTab);
    if (iframe) {
      // eslint-disable-next-line no-self-assign
      iframe.src = iframe.src;
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: '98vw',
          height: '96vh',
          maxWidth: '98vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ pr: 4 }}
        >
          <Typography level="title-lg">Interact (Job {jobId})</Typography>
          {isReady && urls.length > 0 && (
            <IconButton
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={handleRefresh}
            >
              <RefreshCwIcon size={16} />
            </IconButton>
          )}
        </Stack>
        <ModalClose />
        <Divider />
        <DialogContent sx={{ flex: 1, minHeight: 0, overflow: 'hidden', p: 0 }}>
          {!isReady ? (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 2, px: 2 }}
            >
              <Chip color="warning" variant="soft">
                Waiting for service to start
              </Chip>
              {isLoading && <CircularProgress size="sm" />}
            </Stack>
          ) : urls.length === 0 ? (
            <Typography level="body-sm" sx={{ mt: 2, px: 2 }}>
              No service URLs available for this job.
            </Typography>
          ) : (
            <Tabs
              defaultValue={0}
              onChange={(_, val) => setActiveTab(val as number)}
              sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            >
              <TabList>
                {urls.map(({ label }, i) => (
                  <Tab
                    key={label}
                    value={i}
                    sx={{ textTransform: 'capitalize' }}
                  >
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
                    ref={(el: HTMLIFrameElement | null) => {
                      if (el) iframeRefs.current.set(i, el);
                      else iframeRefs.current.delete(i);
                    }}
                    src={src}
                    referrerPolicy="no-referrer"
                    sx={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    }}
                  />
                </TabPanel>
              ))}
            </Tabs>
          )}
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
