import { useState, FormEvent, useEffect } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Select,
  Option,
  Slider,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Sheet,
} from '@mui/joy';
import DynamicPluginForm from '../DynamicPluginForm';

const DefaultLoraConfig = {
  model_max_length: 2048,
  num_train_epochs: 3,
  learning_rate: 1e-3,
  lora_r: 8,
  lora_alpha: 16,
  lora_dropout: 0.05,
};

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TrainingModalLoRA({
  open,
  onClose,
  experimentInfo,
  template_id,
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  template_id?: string;
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedPlugin, setSelectedPlugin] = useState(null);
  const [config, setConfig] = useState(DefaultLoraConfig);

  // Fetch available datasets from the API
  const {
    data: datasets,
    error: datasetsError,
    isLoading: datasetsIsLoading,
  } = useSWR(chatAPI.Endpoints.Dataset.LocalList(), fetcher);

  //Fetch available training plugins
  const {
    data: pluginsData,
    error: pluginsIsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    chatAPI.Endpoints.Experiment.ListScriptsOfType(
      experimentInfo?.id,
      'trainer', // type
      'model_architectures:' +
        experimentInfo?.config?.foundation_model_architecture //filter
    ),
    fetcher
  );
  const {
    data: templateData,
    error: templateError,
    isLoading: templateIsLoading,
    mutate: templateMutate,
  } = useSWR(
    template_id
      ? chatAPI.Endpoints.Jobs.GetTrainingTemplate(template_id)
      : null,
    fetcher
  );
  async function updateTrainingTemplate(
    template_id: string,
    name: string,
    description: string,
    type: string,
    config: string
  ) {
    const configBody = {
      config: config,
    };
    const response = await fetch(
      chatAPI.Endpoints.Jobs.UpdateTrainingTemplate(
        template_id,
        name,
        description,
        type
      ),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(configBody),
      }
    );
    const result = await response.json();
    return result;
  }
  useEffect(() => {
    if (templateData && typeof templateData.config === 'string') {
      templateData.config = JSON.parse(templateData.config);
    }
    if (templateData && templateData.config) {
      setSelectedPlugin(templateData.config.plugin_name);
      setSelectedDataset(templateData.config.dataset_name);
      setConfig(templateData.config);
    } else {
      setSelectedPlugin(null);
      setSelectedDataset(null);
      setConfig(DefaultLoraConfig);
    }
  }, [templateData]);
  // Once you have a dataset selected, we use SWR's dependency mode to fetch the
  // Dataset's info. Note how useSWR is declared as a function -- this is is how
  // the dependency works. If selectedDataset errors, the fetcher knows to not run.
  const { data: currentDatasetInfo, isLoading: currentDatasetInfoIsLoading } =
    useSWR(() => {
      if (selectedDataset === null) {
        return null;
      }
      return chatAPI.Endpoints.Dataset.Info(selectedDataset);
    }, fetcher);
  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

  function injectIntoTemplate(key) {
    // Add the key to the textbox with id "template"
    const template =
      document.getElementById('training-form')?.elements['template'];

    if (template === undefined) return;

    const cursorPosition = template.selectionStart;
    const templateText = template.value;
    const newText =
      templateText.slice(0, cursorPosition) +
      `{{${key}}}` +
      templateText.slice(cursorPosition);
    template.value = newText;
  }

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  return (
    <Modal open={open}>
      <ModalDialog
        sx={{
          width: '70vw',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          top: '10vh',
          overflow: 'auto',
          maxHeight: '80vh',
          minHeight: '70vh',
          height: '100%',
        }}
      >
        <form
          id="training-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries((formData as any).entries());
            if (templateData && template_id) {
              updateTrainingTemplate(
                template_id,
                event.currentTarget.elements['template_name'].value,
                'Description',
                'LoRA',
                JSON.stringify(formJson)
              );
              templateMutate();
            } else {
              chatAPI.saveTrainingTemplate(
                event.currentTarget.elements['template_name'].value,
                'Description',
                'LoRA',
                JSON.stringify(formJson)
              );
            }
            onClose();
          }}
        >
          <Tabs
            aria-label="Training Template Tabs"
            defaultValue={0}
            sx={{ borderRadius: 'lg', display: 'flex', overflow: 'hidden' }}
          >
            <TabList>
              <Tab>Training Data</Tab>
              {/* <Tab>Training Settings</Tab> */}
              <Tab>Plugin Config</Tab>
            </TabList>
            <TabPanel value={0} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Training Template Name</FormLabel>
                  <Input
                    required
                    autoFocus
                    placeholder={
                      templateData ? templateData.name : 'Alpaca Training Job'
                    }
                    value={templateData ? templateData.name : ''}
                    name="template_name"
                    size="lg"
                  />
                  <FormHelperText>
                    Give this training recipe a unique name
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Plugin Script</FormLabel>

                  <Select
                    placeholder={
                      pluginsIsLoading ? 'Loading...' : 'Select Plugin'
                    }
                    variant="soft"
                    size="lg"
                    name="plugin_name"
                    value={selectedPlugin}
                    onChange={(e, newValue) => setSelectedPlugin(newValue)}
                  >
                    {pluginsData?.map((row) => (
                      <Option value={row?.uniqueId} key={row.uniqueId}>
                        {row.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
                <Stack direction="row" justifyContent="space-evenly" gap={2}>
                  <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Model:</FormLabel>
                    <Typography variant="soft">{currentModel}</Typography>
                  </FormControl>
                  <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Architecture:</FormLabel>
                    <Typography variant="soft">
                      {experimentInfo?.config?.foundation_model_architecture}
                    </Typography>
                  </FormControl>

                  <input
                    hidden
                    value={currentModel}
                    name="model_name"
                    readOnly
                  />
                  <input
                    hidden
                    value={
                      experimentInfo?.config?.foundation_model_architecture
                    }
                    name="model_architecture"
                    readOnly
                  />
                </Stack>
                <FormControl>
                  <FormLabel>Dataset</FormLabel>

                  <Select
                    placeholder={
                      datasetsIsLoading ? 'Loading...' : 'Select Dataset'
                    }
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
                {selectedDataset && (
                  <>
                    <FormControl>
                      <FormLabel>Available Fields</FormLabel>

                      <Box
                        sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}
                      >
                        {currentDatasetInfoIsLoading && <CircularProgress />}
                        {/* // For each key in the currentDatasetInfo.features object,
  display it: */}
                        {currentDatasetInfo?.features &&
                          Object.keys(currentDatasetInfo?.features).map(
                            (key) => (
                              <>
                                <Chip
                                  onClick={() => {
                                    injectIntoTemplate(key);
                                  }}
                                >
                                  {key}
                                </Chip>
                                &nbsp;
                              </>
                            )
                          )}
                      </Box>
                      {/* {selectedDataset && (
    <FormHelperText>
      Use the field names above, maintaining capitalization, in
      the template below
    </FormHelperText>
  )} */}
                    </FormControl>
                    <FormControl>
                      <FormLabel>Template</FormLabel>
                      {/* I want the following to be a Textarea, not a textarea
                      but when we do, it gives resizeobserver error when you
                      switch tabs back and forth */}
                      <textarea
                        required
                        name="formatting_template"
                        id="formatting_template"
                        defaultValue={
                          templateData
                            ? templateData.config.formatting_template
                            : 'Instruction: $instruction \n###\n Prompt: $prompt\n###\n Generation: $generation'
                        }
                        rows={5}
                      />
                      <FormHelperText>
                        This describes how the data is formatted when passed to
                        the trainer. Use Python Standard String Templating
                        format. For example <br />
                        "Instruction: $instruction \n###\n Prompt: $prompt
                        \n###\n Generation: $generation"
                        <br />
                        Using the field names from above with the same
                        capitalization.
                      </FormHelperText>
                    </FormControl>
                  </>
                )}
              </Stack>
            </TabPanel>
            <TabPanel value={1} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={selectedPlugin}
                config={config}
              />
            </TabPanel>
          </Tabs>
          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button color="danger" variant="soft" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="soft" type="submit">
              Save Training Template
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
