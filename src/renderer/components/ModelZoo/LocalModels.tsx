/* eslint-disable jsx-a11y/anchor-is-valid */
import { Sheet } from '@mui/joy';
import { useLocation } from 'react-router-dom';

import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import Welcome from '../Welcome/Welcome';

import LocalModelsTable from './LocalModelsTable';
import { fetcher } from '../../lib/transformerlab-api-sdk';

type LocalModelsProps = {
  experimentInfo?: any;
  showOnlyGeneratedModels?: boolean;
  setFoundation?: (name: string) => void;
  setAdaptor?: (name: string) => void;
};

function LocalModels({
  experimentInfo,
  showOnlyGeneratedModels = false,
  setFoundation = () => {},
  setAdaptor = () => {},
}: LocalModelsProps) {
  const { data, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher,
  );

  const location = useLocation();

  if (!experimentInfo && location?.pathname !== '/zoo') {
    return <Welcome />;
  }

  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <LocalModelsTable
        models={data}
        isLoading={isLoading}
        mutateModels={mutate}
        setFoundation={setFoundation}
        setAdaptor={setAdaptor}
        setEmbedding={null}
        showOnlyGeneratedModels={showOnlyGeneratedModels}
      />
    </Sheet>
  );
}

LocalModels.defaultProps = {
  experimentInfo: null,
  showOnlyGeneratedModels: false,
  setFoundation: () => {},
  setAdaptor: () => {},
};

export default LocalModels;
