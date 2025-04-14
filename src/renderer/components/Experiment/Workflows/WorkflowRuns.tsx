/* eslint-disable no-nested-ternary */
import { Sheet } from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function WorkflowRuns({ experimentInfo }) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Workflows.ListRuns(),
    fetcher,
  );

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        mb: 3,
      }}
    >
      The following are unstyled workflow runs. Coming soon..
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </Sheet>
  );
}
