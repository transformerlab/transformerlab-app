import useSWR from 'swr';

import { Grid, LinearProgress, Sheet } from '@mui/joy';
import DatasetCard from './DatasetCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DataStore() {
  const { data, error, isLoading } = useSWR(
    chatAPI.Endpoints.Dataset.Gallery(),
    fetcher
  );

  if (error) return 'An error has occurred.';
  if (isLoading) return <LinearProgress />;
  return (
    <Sheet
      className="OrderTableContainer"
      variant="outlined"
      sx={{
        width: '100%',
        height: '100%',
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
            <DatasetCard
              name={row.name}
              size={row.size}
              key={row.id}
              description={row.description}
              repo={row.huggingfacerepo}
              download
              location={undefined}
              parentMutate={undefined}
            />
          </Grid>
        ))}
      </Grid>
    </Sheet>
  );
}
