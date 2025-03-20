/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import {
  Alert,
  Box,
  Button,
  Select,
  Stack,
  Typography,
  Option,
  Chip,
  FormLabel,
} from '@mui/joy';
import Documents from '../../Shared/Documents';
import Query from './Query';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { CogIcon, XCircleIcon } from 'lucide-react';
import ConfigurePlugin from './ConfigurePlugin';
import { useState } from 'react';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DocumentSearch({ experimentInfo, setRagEngine }) {
  const [openConfigureModal, setOpenConfigureModal] = useState(false);
  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(experimentInfo?.id, 'rag'),
    fetcher,
  );

  if (plugins?.length === 0) {
    return (
      <Sheet sx={{ flexDirection: 'column', flex: '1' }}>
        <Typography level="h1" mb={2}>
          Query Documents
        </Typography>
        <Alert color="warning">
          No RAG Engines available, please install a RAG plugin from the plugin
          store.
        </Alert>
      </Sheet>
    );
  }

  if (
    !experimentInfo?.config?.rag_engine ||
    experimentInfo?.config?.rag_engine === ''
  ) {
    return (
      <Sheet sx={{ flexDirection: 'column', flex: '1' }}>
        <Typography level="h1" mb={2}>
          Query Documents
        </Typography>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries((formData as any).entries());
            const rag_engine = formJson.rag_plugin;
            await setRagEngine(rag_engine);
          }}
        >
          <Stack spacing={2} alignItems="flex-start">
            <Select
              placeholder="Select a RAG Plugin for this Experiment"
              name="rag_plugin"
              required
              sx={{ minWidth: 200 }}
            >
              {plugins?.map((plugin) => (
                <Option key={plugin.uniqueId} value={plugin.uniqueId}>
                  {plugin.name}
                </Option>
              ))}
            </Select>
            <Button type="submit">Select</Button>
          </Stack>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        height: '100%',
      }}
    >
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          width: '100%',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          overflow: 'hidden',
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: '300px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Documents experimentInfo={experimentInfo} fixedFolder="rag" />
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Query experimentInfo={experimentInfo} />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}
          >
            <Typography level="title-sm">
              Rag Engine:{' '}
              <Chip> {experimentInfo?.config?.rag_engine}</Chip>{' '}
            </Typography>

            <Button
              size="sm"
              variant="plain"
              onClick={async (e) => {
                await setRagEngine('');
              }}
              startDecorator={<XCircleIcon size="18px" />}
            >
              Change Engine
            </Button>
            <Button
              variant="plain"
              size="sm"
              startDecorator={<CogIcon size="18px" />}
              onClick={() => setOpenConfigureModal(true)}
            >
              Configure
            </Button>
            <ConfigurePlugin
              open={openConfigureModal}
              onClose={() => setOpenConfigureModal(false)}
              experimentInfo={experimentInfo}
              plugin={experimentInfo?.config?.rag_engine}
              setRagEngine={setRagEngine}
            />
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}
