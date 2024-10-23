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

  function renderTemplate(templateType: string) {
    switch (templateType) {
      case 'alpaca':
        return (
          <>
            <FormControl>
              <FormLabel>Instruction</FormLabel>
              <Textarea
                required
                name="instruction_template"
                id="instruction"
                defaultValue={
                  templateData
                    ? templateData?.config?.instruction_template
                    : 'Instruction: {{instruction}}'
                }
                rows={5}
              />
              <FormHelperText>
                The instruction (usually the system message) to send to the
                model. For example in a summarization task, this could be
                "Summarize the following text:"
              </FormHelperText>
            </FormControl>
            <br />
            <FormControl>
              <FormLabel>Input</FormLabel>
              <Textarea
                required
                name="input_template"
                id="Input"
                defaultValue={
                  templateData
                    ? templateData?.config?.input_template
                    : '{{input}}'
                }
                rows={5}
              />
            </FormControl>
            <FormHelperText>
              The input to send to the model. For example in a summarization
              task, this could be the text to summarize.
            </FormHelperText>
            <br />
            <FormControl>
              <FormLabel>Output</FormLabel>
              <Textarea
                required
                name="output_template"
                id="output"
                defaultValue={
                  templateData
                    ? templateData?.config?.output_template
                    : '{{output}}'
                }
                rows={5}
              />
              <FormHelperText>
                The output to expect from the model. For example in a
                summarization task this could be the expected summary of the
                input text.
              </FormHelperText>
            </FormControl>
          </>
        );
      case 'none':
        return (
          <>
            {parsedData?.training_data_instructions && (
              <Alert color="primary">
                {parsedData?.training_data_instructions}
              </Alert>
            )}
            <Typography level="title-md" py={1}>
              Preview:
            </Typography>
            <DatasetTable datasetId={selectedDataset} />
          </>
        );
      default:
        return (
          <>
            <FormControl>
              <textarea
                required
                name="formatting_template"
                id="formatting_template"
                defaultValue={
                  templateData
                    ? templateData?.config?.formatting_template
                    : 'Instruction: {{instruction}}\nPrompt: {{prompt}}\nGeneration: {{generation}}'
                }
                rows={5}
              />
              <FormHelperText
                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                This describes how the data is formatted when passed to the
                trainer. Use Jinja2 Standard String Templating format. For
                example:
                <br />
                <span style={{}}>
                  Summarize the following:
                  <br />
                  Prompt: &#123;&#123;prompt&#125;&#125;
                  <br />
                  Generation: &#123;&#123;generation&#125;&#125;
                </span>
              </FormHelperText>
            </FormControl>
            <Typography level="title-md" py={1}>
              Preview:
            </Typography>
            <DatasetTable datasetId={selectedDataset} />
          </>
        );
    }
  }

  const parsedData = data ? JSON.parse(data) : null;
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
        <FormLabel>Training Dataset</FormLabel>

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
      </FormControl>
      <Divider />

      {selectedDataset && (
        <>
          {parsedData?.training_template_format !== 'none' && (
            <>
              <Alert sx={{ mt: 1 }} color="danger">
                <FormControl>
                  <Typography level="title-md" mt={0} pb={1}>
                    Available Fields in <u>{selectedDataset}</u> Dataset
                  </Typography>
                  <Box sx={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                    {currentDatasetInfoIsLoading && <CircularProgress />}
                    {/* // For each key in the currentDatasetInfo.features object,
  display it: */}
                    {(!currentDatasetInfo?.features ||
                      currentDatasetInfo?.success == 'false') &&
                      'No fields available'}
                    {currentDatasetInfo?.features &&
                      Object.keys(currentDatasetInfo?.features).map((key) => (
                        <>
                          <Chip
                            color="success"
                            onClick={() => {
                              injectIntoTemplate(key);
                            }}
                          >
                            {key}
                          </Chip>
                          &nbsp;
                        </>
                      ))}
                  </Box>

                  {selectedDataset && (
                    <FormHelperText>
                      Use the field names above, surrounded by
                      &#123;&#123;&#125;&#125; in the template below
                    </FormHelperText>
                  )}
                </FormControl>
              </Alert>
              {/* <Divider sx={{ mt: '1rem', mb: '2rem' }} /> */}
              <Typography level="title-md" mt={2} mb={0.5}>
                Template
              </Typography>
            </>
          )}

          {renderTemplate(parsedData?.training_template_format)}
        </>
      )}
    </Box>
  );
}
