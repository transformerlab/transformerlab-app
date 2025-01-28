import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  FormHelperText,
  FormLabel,
  Textarea,
  Typography,
} from '@mui/joy';
import { InfoIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import DatasetTableWithTemplate from 'renderer/components/Data/DatasetPreviewWithTemplate';
import DatasetTable from 'renderer/components/Data/DatasetTable';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useDebounce } from 'use-debounce';

const fetcher = (url) => fetch(url).then((res) => res.json());

function TrainingModalDataTemplatingTab({
  selectedDataset,
  currentDatasetInfo,
  templateData,
  injectIntoTemplate,
  experimentInfo,
  pluginId,
}) {
  const [template, setTemplate] = useState(
    'Instruction: Summarize the Following\nPrompt: {{dialogue}}\nGeneration: {{summary}}'
  );
  useEffect(() => {
    //initialize the template with the saved value
    if (templateData?.config?.formatting_template) {
      setTemplate(templateData?.config?.formatting_template);
    }
  }, [templateData?.config?.formatting_template]);

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

  const [debouncedTemplate] = useDebounce(template, 3000);
  let parsedData;

  try {
    parsedData = data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error parsing data', e);
    parsedData = '';
  }

  function PreviewSection() {
    return (
      <>
        <Typography level="title-lg" mt={2}>
          Preview Templated Output:{' '}
          {template != debouncedTemplate && (
            <CircularProgress
              color="neutral"
              variant="plain"
              sx={{
                '--CircularProgress-size': '12px',
                '--CircularProgress-trackThickness': '2px',
                '--CircularProgress-progressThickness': '2px',
              }}
            />
          )}
        </Typography>
        <Typography level="body-sm" textColor="text.tertiary" fontWeight={400}>
          Below we render the actual data using the template you provide
        </Typography>

        <DatasetTableWithTemplate
          datasetId={selectedDataset}
          template={debouncedTemplate}
        />
      </>
    );
  }

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
            {selectedDataset && <PreviewSection />}
          </>
        );
      case 'none':
        return <>No data template is required for this trainer</>;
      default:
        return (
          <>
            <FormControl>
              <textarea
                required
                name="formatting_template"
                id="instruction"
                rows={5}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
            </FormControl>
            {selectedDataset && <PreviewSection />}
          </>
        );
    }
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
      {parsedData?.training_template_format !== 'none' && (
        <>
          <Alert sx={{ mt: 1 }} color="danger">
            <FormControl>
              <Typography level="title-md" mt={0} pb={1}>
                Available Fields in <u>{selectedDataset}</u> Dataset
              </Typography>
              <Box sx={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
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
              <FormHelperText
                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                The formatting template describes how the data is formatted when
                passed to the trainer. Use the Jinja2 Standard String Templating
                format. For example:
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
          </Alert>
        </>
      )}
      <Typography level="title-lg" mt={2} mb={0.5}>
        Formatting Template
      </Typography>
      {renderTemplate(parsedData?.training_template_format)}
    </Box>
  );
}

export default TrainingModalDataTemplatingTab;
