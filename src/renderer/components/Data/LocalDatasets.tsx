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
} from '@mui/joy';
import { PlusIcon } from 'lucide-react';
import DatasetCard from './DatasetCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import NewDatasetModal from './NewDatasetModal';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function LocalDatasets() {
  const [newDatasetModalOpen, setNewDatasetModalOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.LocalList(),
    fetcher
  );

  if (error) return 'An error has occurred.';
  if (isLoading) return <LinearProgress />;
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      <NewDatasetModal
        open={newDatasetModalOpen}
        setOpen={setNewDatasetModalOpen}
      />

      <Sheet
        variant="outlined"
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
          {data.map((row) => (
            <Grid xs={4}>
              {/* {<pre>{JSON.stringify(row, null, 2)}</pre>} */}
              <DatasetCard
                name={row?.dataset_id}
                size={row?.size}
                key={row.id}
                description={row?.description}
                repo={row.huggingfacerepo}
                location={row?.location}
                parentMutate={mutate}
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
            <Input
              placeholder="Open-Orca/OpenOrca"
              endDecorator={<Button>Download 🤗 Dataset</Button>}
              sx={{ width: '500px' }}
            />

            {/* <FormHelperText>
Enter full URL of model, for example:
"decapoda-research/llama-30b-hf"
</FormHelperText> */}
          </FormControl>
          <>
            {/* <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<FolderOpenIcon />}
              onClick={() => {}}
            >
              Open in Filesystem
            </Button> */}
            <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<PlusIcon />}
              onClick={() => {
                setNewDatasetModalOpen(true);
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
