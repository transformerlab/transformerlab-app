import useSWR from 'swr';

import { Grid, LinearProgress, Sheet } from '@mui/joy';
import PluginCard from './PluginCard';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PluginGallery({ experimentInfo }) {
  const { data, error, isLoading } = useSWR(
    chatAPI.Endpoints.Plugins.Gallery(),
    fetcher
  );

  if (error)
    return (
      'An error has occurred.' + chatAPI.Endpoints.Plugins.Gallery() + error
    );
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
            <PluginCard
              plugin={row}
              key={row.id}
              type={row.type}
              download
              experimentInfo={experimentInfo}
              parentMutate={undefined}
            />
          </Grid>
        ))}
      </Grid>
    </Sheet>
  );
}
