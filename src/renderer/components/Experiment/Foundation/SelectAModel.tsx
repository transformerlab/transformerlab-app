/* eslint-disable jsx-a11y/anchor-is-valid */

import {
  FormControl,
  FormLabel,
  Select,
  Typography,
  Option,
  Sheet,
} from '@mui/joy';

import { useLocation } from 'react-router-dom';

import CurrentFoundationInfo from './CurrentFoundationInfo';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

import { modelTypes, licenseTypes } from '../../../lib/utils';
import LocalModelsTable from 'renderer/components/ModelZoo/LocalModelsTable';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function SelectAModel({
  experimentInfo,
  setFoundation = (model) => {},
  setAdaptor = (name: string) => {},
}) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher
  );

  const location = useLocation();

  if (experimentInfo?.config?.foundation) {
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
    return 'Select an Experiment';
  }

  return (
    <Sheet
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', pb: 2 }}
    >
      <Typography level="h1" mb={2}>
        Select a Model
      </Typography>
      <LocalModelsTable
        models={data}
        mutateModels={mutate}
        setFoundation={setFoundation}
        setAdaptor={setAdaptor}
        pickAModelMode
      />
    </Sheet>
  );
}
