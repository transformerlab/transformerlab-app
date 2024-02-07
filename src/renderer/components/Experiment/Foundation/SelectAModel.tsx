/* eslint-disable jsx-a11y/anchor-is-valid */

import { FormControl, FormLabel, Select, Typography, Option } from '@mui/joy';

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

  function foundationSetter(model) {
    setFoundation(model);

    setAdaptor('');
  }

  const renderFilters = () => (
    <>
      <FormControl size="sm">
        <FormLabel>License</FormLabel>
        <Select
          placeholder="Filter by license"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
          value={filters?.license}
          disabled
          onChange={(e, newValue) => {
            setFilters({ ...filters, license: newValue });
          }}
        >
          {licenseTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
      <FormControl size="sm">
        <FormLabel>Architecture</FormLabel>
        <Select
          placeholder="All"
          disabled
          value={filters?.architecture}
          onChange={(e, newValue) => {
            setFilters({ ...filters, architecture: newValue });
          }}
        >
          {modelTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
    </>
  );

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
    <>
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
    </>
  );
}
