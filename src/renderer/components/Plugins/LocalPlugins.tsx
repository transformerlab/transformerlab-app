import { useState } from 'react';
import useSWR from 'swr';

import {
  Box,
  Button,
  FormControl,
  Grid,
  Input,
  LinearProgress,
  Sheet,
  Typography,
} from '@mui/joy';
import { FolderOpenIcon, PlusIcon } from 'lucide-react';
import PluginCard from './PluginCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import NewPluginModal from './NewPluginModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function LocalPlugins({ experimentInfo }) {
  const [newPluginModalOpen, setNewPluginModalOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Experiment.ListScripts(experimentInfo?.id),
    fetcher
  );

  if (error) return 'An error has occurred.';
  if (isLoading) return <LinearProgress />;
  if (!experimentInfo?.id) return 'No experiment selected.';
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      <NewPluginModal
        open={newPluginModalOpen}
        setOpen={setNewPluginModalOpen}
        mutate={mutate}
        experimentInfo={experimentInfo}
      />
      <Typography level="body-md">
        Below are plugin scripts installed to project{' '}
        <b>{experimentInfo?.name}</b>. Additional scripts can be added from the
        Script Store{' '}
      </Typography>
      <Sheet
        variant="soft"
        color="primary"
        sx={{
          width: '100%',
          borderRadius: 'md',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: 2,
        }}
      >
        <Grid container spacing={2} sx={{ flexGrow: 1 }}>
          {data &&
            data.length === 0 &&
            'No local scripts found. Download in the store.'}
          {data.map((row) => (
            <Grid xs={4}>
              <PluginCard
                plugin={row}
                key={row.id}
                type={row['type']}
                parentMutate={mutate}
                download={undefined}
                experimentInfo={experimentInfo}
              />
            </Grid>
          ))}
        </Grid>
      </Sheet>
      <Box
        sx={{
          justifyContent: 'space-between',
          display: 'flex',
          width: '100%',
          paddingTop: '12px',
        }}
      >
        <>
          <FormControl>
            {/* <FormLabel>Load 🤗 Hugging Face Model</FormLabel> */}
            {/* <Input
              placeholder="http://www.example.com/example-plugin"
              endDecorator={<Button>Download Plugin</Button>}
              sx={{ width: '500px' }}
            /> */}

            {/* <FormHelperText>
Enter full URL of model, for example:
"decapoda-research/llama-30b-hf"
</FormHelperText> */}
          </FormControl>
          <>
            <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<PlusIcon />}
              onClick={() => {
                setNewPluginModalOpen(true);
              }}
            >
              New
            </Button>
          </>
        </>
      </Box>
    </Sheet>
  );
}
