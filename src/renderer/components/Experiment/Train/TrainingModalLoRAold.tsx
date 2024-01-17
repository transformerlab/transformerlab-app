import { useState, FormEvent } from 'react';
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
import DynamicPluginForm from './DynamicPluginForm';

const DefaultLoraConfig = {
  model_max_length: 2048,
  num_train_epochs: 3,
  learning_rate: 1e-3,
  lora_r: 8,
  lora_alpha: 16,
  lora_dropout: 0.05,
};

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TrainingModalLoRA({ open, onClose, experimentInfo }) {
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

  const currentModelName = experimentInfo?.config?.foundation;

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
            //alert(JSON.stringify(formJson));
            chatAPI.saveTrainingTemplate(
              event.currentTarget.elements['template_name'].value,
              'Description',
              'LoRA',
              JSON.stringify(formJson)
            );
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
              <Tab>LoRA Settings</Tab>
              <Tab>Form Test</Tab>
            </TabList>
            <TabPanel value={0} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Training Template Name</FormLabel>
                  <Input
                    required
                    autoFocus
                    placeholder="Alpaca Training Job"
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
                    <Typography variant="soft">{currentModelName}</Typography>
                  </FormControl>
                  <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Architecture:</FormLabel>
                    <Typography variant="soft">
                      {experimentInfo?.config?.foundation_model_architecture}
                    </Typography>
                  </FormControl>

                  <input
                    hidden
                    value={currentModelName}
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
                        defaultValue="Instruction: $instruction \n###\n Prompt: $prompt\n###\n Generation: $generation"
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
                <FormControl>
                  <FormLabel>Adaptor Name</FormLabel>
                  <Input
                    required
                    placeholder="alpha-beta-gamma"
                    name="adaptor_name"
                  />
                </FormControl>
              </Stack>
            </TabPanel>
            <TabPanel value={1} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <Sheet
                sx={{ maxHeight: '60vh', overflow: 'auto', display: 'flex' }}
              >
                <Stack gap="20px" sx={{ flex: 1, height: 'fit-content' }}>
                  <Typography level="h4">Training Settings</Typography>
                  <FormControl>
                    <FormLabel>
                      Maximum Sequence Length &nbsp;
                      <span style={{ color: '#aaa' }}>
                        {config.model_max_length}
                      </span>
                    </FormLabel>
                    <Slider
                      sx={{ margin: 'auto', width: '90%' }}
                      value={config.model_max_length}
                      min={0}
                      max={2048 * 2}
                      step={32}
                      valueLabelDisplay="off"
                      name="model_max_length"
                      onChange={(e, newValue) => {
                        setConfig({
                          ...config,
                          model_max_length: newValue,
                        });
                      }}
                    />
                    <FormHelperText>
                      Input longer than this length will be truncated. Keep
                      lower to save memory.
                    </FormHelperText>
                  </FormControl>
                  <FormLabel>
                    Epochs &nbsp;
                    <span style={{ color: '#aaa' }}>
                      {config.num_train_epochs}
                    </span>
                  </FormLabel>
                  <Slider
                    sx={{ margin: 'auto', width: '90%' }}
                    value={config.num_train_epochs}
                    min={0}
                    max={24}
                    valueLabelDisplay="off"
                    name="num_train_epochs"
                    onChange={(e, newValue) =>
                      setConfig({
                        ...config,
                        num_train_epochs: newValue,
                      })
                    }
                  />
                  <FormLabel>
                    Learning Rate &nbsp;
                    <span style={{ color: '#aaa' }}>
                      {config.learning_rate.toExponential(0)}
                      {/*  in GUI we store only
                       the exponent so make sure you convert when actually sending to the API */}
                    </span>
                  </FormLabel>
                  <Slider
                    sx={{ margin: 'auto', width: '90%' }}
                    defaultValue={1}
                    min={-6}
                    max={6}
                    step={1 / 2}
                    name="learning_rate"
                    onChange={(e, newValue) => {
                      setConfig({
                        ...config,
                        learning_rate: 10 ** newValue,
                      });
                    }}
                    valueLabelDisplay="off"
                  />
                </Stack>
                <Stack gap="20px" sx={{ flex: 1, height: 'fit-content' }}>
                  <Typography level="h4">LoRA Settings</Typography>
                  <FormControl>
                    <FormLabel>
                      LoRA R &nbsp;
                      <span style={{ color: '#aaa' }}>{config.lora_r}</span>
                    </FormLabel>
                    <Slider
                      sx={{ margin: 'auto', width: '90%' }}
                      defaultValue={8}
                      min={4}
                      max={64}
                      step={4}
                      name="lora_r"
                      valueLabelDisplay="off"
                      onChange={(e, newValue) => {
                        setConfig({
                          ...config,
                          lora_r: newValue,
                        });
                      }}
                    />
                    <FormHelperText>
                      Rank of the update matrices, expressed in int. Lower rank
                      results in smaller update matrices with fewer trainable
                      parameters.
                    </FormHelperText>
                  </FormControl>
                  <FormLabel>
                    LoRA Alpha &nbsp;
                    <span style={{ color: '#aaa' }}>{config.lora_alpha}</span>
                  </FormLabel>
                  <Slider
                    sx={{ margin: 'auto', width: '90%' }}
                    defaultValue={16}
                    min={4}
                    max={64 * 2}
                    step={4}
                    name="lora_alpha"
                    valueLabelDisplay="off"
                    onChange={(e, newValue) => {
                      setConfig({
                        ...config,
                        lora_alpha: newValue,
                      });
                    }}
                  />
                  <FormHelperText>
                    LoRA scaling factor. Make it a multiple of LoRA R.
                  </FormHelperText>
                  <FormLabel>
                    LoRA Dropout &nbsp;
                    <span style={{ color: '#aaa' }}>{config.lora_dropout}</span>
                  </FormLabel>
                  <Slider
                    sx={{ margin: 'auto', width: '90%' }}
                    defaultValue={0.1}
                    min={0.1}
                    max={0.9}
                    step={0.1}
                    name="lora_dropout"
                    valueLabelDisplay="off"
                    onChange={(e, newValue) => {
                      setConfig({
                        ...config,
                        lora_dropout: newValue,
                      });
                    }}
                  />
                  <FormHelperText>
                    Dropout probability of the LoRA layers
                  </FormHelperText>
                </Stack>
              </Sheet>
            </TabPanel>
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={selectedPlugin}
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
