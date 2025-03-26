/* eslint-disable jsx-a11y/anchor-is-valid */
import { useCallback, useState } from 'react';

import { Sheet, Typography, Stack, LinearProgress, Modal } from '@mui/joy';

import { useLocation } from 'react-router-dom';

import CurrentFoundationInfo from '../Experiment/Foundation/CurrentFoundationInfo';
import ImportModelsBar from './ImportModelsBar';

import useSWR from 'swr';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import Welcome from '../Welcome/Welcome';

import LocalModelsTable from './LocalModelsTable';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function LocalModels({
  pickAModelMode = false,
  experimentInfo,
  showOnlyGeneratedModels = false,
  setFoundation = (name: string) => {},
  setAdaptor = (name: string) => {},
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(null);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher,
  );

  const location = useLocation();

  const foundationSetter = useCallback(async (name) => {
    setOpen(true);

    setFoundation(name);
    const escapedModelName = name.replaceAll('.', '\\.');

    setAdaptor('');

    setOpen(false);
  }, []);

  if (pickAModelMode && experimentInfo?.config?.foundation) {
    return (
      <CurrentFoundationInfo
        experimentInfo={experimentInfo}
        foundation={experimentInfo?.config?.adaptor}
        setFoundation={setFoundation}
        adaptor={experimentInfo?.config?.adaptor}
        setAdaptor={setAdaptor}
      />
    );
  }

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
      {/* <Typography level="h1">Local Models</Typography> */}
      <Modal
        aria-labelledby="modal-title"
        aria-describedby="modal-desc"
        open={open}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Sheet
          variant="outlined"
          sx={{
            maxWidth: 500,
            borderRadius: 'md',
            p: 3,
            boxShadow: 'lg',
          }}
        >
          <Typography
            component="h2"
            id="modal-title"
            level="h4"
            textColor="inherit"
            fontWeight="lg"
            mb={1}
          >
            Preparing Model
          </Typography>
          <Typography id="modal-desc" textColor="text.tertiary">
            <Stack spacing={2} sx={{ flex: 1 }}>
              Quantizing Parameters:
              <LinearProgress />
            </Stack>
          </Typography>
        </Sheet>
      </Modal>
      <LocalModelsTable
        models={data}
        mutateModels={mutate}
        setFoundation={setFoundation}
        setAdaptor={setAdaptor}
        showOnlyGeneratedModels={showOnlyGeneratedModels}
      />

      <ImportModelsBar />
    </Sheet>
  );
}
