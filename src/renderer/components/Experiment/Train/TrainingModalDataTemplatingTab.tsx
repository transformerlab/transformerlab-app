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
  Switch,
  Stack,
  Select,
  Option,
} from '@mui/joy';
import { InfoIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import DatasetTableWithTemplate from 'renderer/components/Data/DatasetPreviewWithTemplate';
import DatasetTable from 'renderer/components/Data/DatasetTable';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useDebounce } from 'use-debounce';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';

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
    'Instruction: Summarize the Following\nPrompt: {{dialogue}}\nGeneration: {{summary}}',
  );
  const [applyChatTemplate, setApplyChatTemplate] = useState(false);
  const [chatTemplate, setChatTemplate] = useState('');
  const [chatColumn, setChatColumn] = useState('');

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
        'index.json',
      ),
    fetcher,
  );

  const {
    data: chatTemplateData,
    error: chatTemplateError,
    isLoading: isChatTemplateLoading,
  } = useAPI(
    'models',
    ['chatTemplate'],
    { modelName: experimentInfo?.config?.foundation },
    { enabled: !!applyChatTemplate && !!experimentInfo?.config?.foundation },
  );

  useEffect(() => {
    if (applyChatTemplate && chatTemplateData?.data) {
      setChatTemplate(chatTemplateData.data);
    }
  }, [applyChatTemplate, chatTemplateData]);

  const [debouncedTemplate] = useDebounce(template, 3000);
  const [debouncedChatTemplate] = useDebounce(chatTemplate, 3000);

  let parsedData;

  try {
    parsedData = data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error parsing data', e);
    parsedData = '';
  }

  function PreviewSection() {
    if (applyChatTemplate && !chatColumn) {
      return null;
    }
    return (
      <>
        <Typography level="title-lg" mt={2}>
          Preview Templated Output:{' '}
          {(template != debouncedTemplate ||
            chatTemplate != debouncedChatTemplate) && (
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
          modelName={
            applyChatTemplate ? experimentInfo?.config?.foundation : ''
          }
          chatColumn={applyChatTemplate ? chatColumn : ''}
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
      case 'missing_chat':
        return (
          <>
            No configuration data available for this model. This may happen with
            local models.
          </>
        );
      case 'chat':
        return (
          <>
            <FormControl>
              <details>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: 500,
                    marginBottom: 8,
                  }}
                >
                  Show Chat Template
                </summary>
                <textarea
                  required
                  name="formatting_chat_template"
                  id="chat_template"
                  rows={10}
                  value={chatTemplate}
                  // onChange={(e) => setChatTemplate(e.target.value)}
                  style={{ width: '100%', marginTop: '8px' }}
                />
                <FormHelperText>
                  This template is fetched from the model's tokenizer config.
                </FormHelperText>
              </details>
            </FormControl>

            {selectedDataset && <PreviewSection />}
          </>
        );
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
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <Switch
          checked={applyChatTemplate}
          onChange={(e) => setApplyChatTemplate(e.target.checked)}
        />
        <Typography level="body-md">Apply Chat Template</Typography>
      </Stack>
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
              {applyChatTemplate ? (
                <>
                  <FormHelperText sx={{ mb: 1 }}>
                    The formatting template describes how JSON-formatted chat
                    conversations are formatted when passed to the trainer using
                    the model's template.
                    <br />
                  </FormHelperText>

                  <FormLabel>
                    You can select which field to use for training:
                  </FormLabel>

                  {!currentDatasetInfo?.features ||
                  currentDatasetInfo?.success === 'false' ? (
                    <FormHelperText>No fields available</FormHelperText>
                  ) : (
                    <Select
                      value={chatColumn}
                      placeholder="Select field"
                      onChange={(_, value) => {
                        setChatColumn(value);
                      }}
                      sx={{ width: '200px' }}
                    >
                      {Object.keys(currentDatasetInfo.features).map((key) => (
                        <Option key={key} value={key}>
                          {key}
                        </Option>
                      ))}
                    </Select>
                  )}
                </>
              ) : (
                <>
                  {selectedDataset && (
                    <FormHelperText>
                      Use the field names above, surrounded by
                      &#123;&#123;&#125;&#125; in the template below
                    </FormHelperText>
                  )}
                  <FormHelperText
                    sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
                  >
                    The formatting template describes how the data is formatted
                    when passed to the trainer. Use the Jinja2 Standard String
                    Templating format. For example:
                    <br />
                    <span style={{}}>
                      Summarize the following:
                      <br />
                      Prompt: &#123;&#123;prompt&#125;&#125;
                      <br />
                      Generation: &#123;&#123;generation&#125;&#125;
                    </span>
                  </FormHelperText>
                </>
              )}
            </FormControl>
          </Alert>
        </>
      )}
      <Typography level="title-lg" mt={2} mb={0.5}>
        Formatting Template
      </Typography>
      {applyChatTemplate
        ? chatTemplateData?.data
          ? renderTemplate('chat')
          : renderTemplate('missing_chat')
        : renderTemplate('parsedData?.training_template_format')}
    </Box>
  );
}

export default TrainingModalDataTemplatingTab;
