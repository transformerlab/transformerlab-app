import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Select,
  Option,
  Textarea,
  Typography,
  Alert,
} from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { parse } from 'path';
import DatasetTable from 'renderer/components/Data/DatasetTable';
import OneTimePopup from 'renderer/components/Shared/OneTimePopup';

import AvailableFieldsImage from 'renderer/img/show-available-fields.png';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TrainingModalDataTab({
  datasetsIsLoading,
  datasets,
  selectedDataset,
  setSelectedDataset,
  currentDatasetInfoIsLoading,
  currentDatasetInfo,
  templateData,
  injectIntoTemplate,
  experimentInfo,
  pluginId,
  displayMessage,
}) {
  const { data, error, isLoading, mutate } = useSWR(
    experimentInfo?.id &&
      pluginId &&
      chatAPI.Endpoints.Experiment.ScriptGetFile(
        experimentInfo?.id,
        pluginId,
        'index.json'
      ),
    fetcher
  );

  let parsedData;
  try {
    parsedData = data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error parsing data', e);
    parsedData = '';
  }
  return (
    <Box
      sx={{
        overflow: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* <pre>{JSON.stringify(templateData, null, 2)}</pre> */}
      <FormControl>
        <FormLabel>Dataset</FormLabel>
        <Select
          placeholder={datasetsIsLoading ? 'Loading...' : 'Select Dataset'}
          variant="soft"
          size="lg"
          name="dataset_name"
          value={selectedDataset}
          onChange={(e, newValue) => setSelectedDataset(newValue)}
        >
          {datasets?.map((row) => (
            <Option value={row?.dataset_id} key={row.id}>
              {row.dataset_id}
            </Option>
          ))}
        </Select>
        <FormHelperText>{displayMessage}</FormHelperText>
      </FormControl>
      {parsedData?.training_data_instructions && (
        <Alert color="warning" sx={{ mt: 2 }}>
          {parsedData?.training_data_instructions}
        </Alert>
      )}
      <Divider />

      {selectedDataset && (
        <>
          <Typography level="title-md" py={1}>
            Preview:
          </Typography>
          <DatasetTable datasetId={selectedDataset} />{' '}
        </>
      )}
    </Box>
  );
}
