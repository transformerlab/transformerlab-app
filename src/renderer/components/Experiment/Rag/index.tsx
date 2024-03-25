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
} from '@mui/joy';
import Documents from './Documents';
import Query from './Query';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DocumentSearch({ experimentInfo, setRagEngine }) {
  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(experimentInfo?.id, 'rag'),
    fetcher
  );

  if (plugins?.length === 0) {
    return (
      <>
        <Typography level="h1" mb={2}>
          Query Documents
        </Typography>
        <Alert color="warning">
          No RAG Engines available, please install a RAG plugin from the plugin
          store.
        </Alert>
      </>
    );
  }

  if (
    !experimentInfo?.config?.rag_engine ||
    experimentInfo?.config?.rag_engine === ''
  ) {
    return (
      <>
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
            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </>
    );
  }

  return (
    <>
      <Typography level="h1">Query Documents</Typography>

      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          width: '100%',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 3, display: 'flex', flexDirection: 'column' }}>
          <Query experimentInfo={experimentInfo} />
          <Typography level="title-md">
            Rag Engine: {experimentInfo?.config?.rag_engine}{' '}
            <Button
              size="sm"
              variant="plain"
              onClick={async (e) => {
                await setRagEngine('');
              }}
            >
              Change
            </Button>
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Documents experimentInfo={experimentInfo} />
        </Box>
      </Sheet>
    </>
  );
}
