import { useState, FormEvent, useEffect } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Sheet,
} from '@mui/joy';
import DynamicPluginForm from '../DynamicPluginForm';
import TrainingModalDataTab from './TraningModalDataTab';

import AvailableFieldsImage from 'renderer/img/show-available-fields.png';

import { generateFriendlyName } from 'renderer/lib/utils';
import OneTimePopup from 'renderer/components/Shared/OneTimePopup';
import TrainingModalDataTemplatingTab from './TrainingModalDataTemplatingTab';
const fetcher = (url) => fetch(url).then((res) => res.json());

function PluginIntroduction({ experimentInfo, pluginId }) {
  const { data, error, isLoading } = useSWR(
    chatAPI.Endpoints.Experiment.ScriptGetFile(
      experimentInfo?.id,
      pluginId,
      'info.md',
    ),
    fetcher,
  );

  return (
    <>
      <Markdown remarkPlugins={[remarkGfm]} className="editableSheetContent">
        {data && data != 'FILE NOT FOUND'
          ? data
          : 'No description for this plugin is availabe.'}
      </Markdown>
    </>
  );
}

export default function TrainingModalLoRA({
  open,
  onClose,
  experimentInfo,
  task_id,
  pluginId,
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  task_id?: string;
  pluginId: string;
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [config, setConfig] = useState({});
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);
  const [sweepConfig, setSweepConfig] = useState<{ [key: string]: string[] }>(
    {},
  );

  // Fetch training type with useSWR
  const { data: trainingTypeData } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Experiment.ScriptGetFile(
          experimentInfo.id,
          pluginId,
          'index.json',
        )
      : null,
    fetcher,
  );

  let trainingType = 'LoRA';
  if (
    trainingTypeData &&
    trainingTypeData !== 'undefined' &&
    trainingTypeData.length > 0
  ) {
    trainingType = JSON.parse(trainingTypeData)?.train_type || 'LoRA';
  }

  let runSweeps = false;
  if (
    trainingTypeData &&
    trainingTypeData !== 'undefined' &&
    trainingTypeData.length > 0
  ) {
    const parsedData = JSON.parse(trainingTypeData);
    if (Array.isArray(parsedData?.supports)) {
      runSweeps = parsedData.supports.includes('sweeps');
    }
  }

  // Fetch available datasets from the API
  const {
    data: datasets,
    error: datasetsError,
    isLoading: datasetsIsLoading,
  } = useSWR(chatAPI.Endpoints.Dataset.LocalList(), fetcher);

  const {
    data: templateData,
    error: templateError,
    isLoading: templateIsLoading,
    mutate: templateMutate,
  } = useSWR(
    task_id ? chatAPI.Endpoints.Tasks.GetByID(task_id) : null,
    fetcher,
  );

  async function updateTask(
    task_id: string,
    inputs: string,
    config: string,
    outputs: string,
  ) {
    const configBody = {
      inputs: inputs,
      config: config,
      outputs: outputs,
    };
    const response = await fetch(chatAPI.Endpoints.Tasks.UpdateTask(task_id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(configBody),
    });
    const result = await response.json();
    return result;
  }

  async function createNewTask(
    name: string,
    plugin: string,
    experimentId: string,
    inputs: string,
    config: string,
    outputs: string,
  ) {
    const configBody = {
      name: name,
      plugin: plugin,
      experiment_id: experimentId,
      inputs: inputs,
      config: config,
      outputs: outputs,
      type: 'TRAIN',
    };
    const response = await fetch(chatAPI.Endpoints.Tasks.NewTask(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(configBody),
    });
    const result = await response.json();
    return result;
  }
  // Whenever template data updates, we need to update state variables used in the form.
  useEffect(() => {
    if (templateData && typeof templateData.config === 'string') {
      // Should only parse data once after initial load
      templateData.config = JSON.parse(templateData.config);
    }
    if (templateData && templateData.config) {
      setSelectedDataset(templateData.config.dataset_name);
      setConfig(templateData.config);
      setNameInput(templateData.name);
      if (templateData.config.sweep_config) {
        setSweepConfig(JSON.parse(templateData.config.sweep_config));
      } else {
        setSweepConfig({});
      }
    } else {
      // This case is for when we are creating a new template
      setSelectedDataset(null);
      setConfig({});
      setNameInput(generateFriendlyName());
      setSweepConfig({});
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
      document.getElementById('training-form')?.elements['formatting_template'];

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

  function TrainingModalFirstTab() {
    return (
      <Stack spacing={2}>
        <FormControl>
          <FormLabel>Training Template Name</FormLabel>
          <Input
            required
            autoFocus
            value={nameInput} //Value needs to be stored in a state variable otherwise it will not update on change/update
            onChange={(e) => setNameInput(e.target.value)}
            name="template_name"
            size="lg"
          />
          <FormHelperText>
            Give this specific training recipe a unique name
          </FormHelperText>
        </FormControl>
        <FormLabel>Info</FormLabel>
        <Sheet color="neutral" variant="soft">
          <Stack direction="column" justifyContent="space-evenly" gap={2} p={2}>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Base Model:</FormLabel>
              <Input readOnly value={currentModel} variant="soft" />
            </FormControl>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Architecture:</FormLabel>
              <Input
                readOnly
                value={experimentInfo?.config?.foundation_model_architecture}
                variant="soft"
              />
            </FormControl>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Plugin:</FormLabel>
              <Input
                readOnly
                value={pluginId}
                variant="soft"
                name="plugin_name"
              />
            </FormControl>
            <input hidden value={currentModel} name="model_name" readOnly />
            <input
              hidden
              value={experimentInfo?.config?.foundation_model_architecture}
              name="model_architecture"
              readOnly
            />
            <input
              hidden
              value={experimentInfo?.config?.foundation_filename}
              name="foundation_model_file_path"
              readOnly
            />
            <input
              hidden
              value={experimentInfo?.config?.embedding_model}
              name="embedding_model"
              readOnly
            />
            <input
              hidden
              value={experimentInfo?.config?.embedding_model_architecture}
              name="embedding_model_architecture"
              readOnly
            />
            <input
              hidden
              value={experimentInfo?.config?.embedding_model_filename}
              name="embedding_model_file_path"
              readOnly
            />
          </Stack>
        </Sheet>
      </Stack>
    );
  }
  function SweepConfigTab({ trainingTypeData, sweepConfig, setSweepConfig }) {
    const [newParam, setNewParam] = useState('');
    const [newValues, setNewValues] = useState('');

    // Parse parameters from trainingTypeData
    let availableParameters = [];
    let parameterTypes = {};
    try {
      if (trainingTypeData && trainingTypeData !== 'undefined') {
        const parsedData = JSON.parse(trainingTypeData);
        // Extract parameter names and their types from the training type data
        if (parsedData?.parameters) {
          availableParameters = Object.keys(parsedData.parameters);
          // Store parameter types for conversion later
          Object.entries(parsedData.parameters).forEach(([param, config]) => {
            if (config && typeof config === 'object' && 'type' in config) {
              parameterTypes[param] = config.type;
            }
          });
        }
      }
    } catch (error) {
      console.error('Error parsing training type data:', error);
    }

    // Filter out parameters that are already in sweepConfig
    const unusedParameters = availableParameters.filter(
      (param) => !Object.keys(sweepConfig).includes(param),
    );

    const addSweepParam = () => {
      if (newParam && newValues.trim()) {
        // Split values by comma and trim whitespace
        const valuesArray = newValues.split(',').map((val) => {
          const trimmedValue = val.trim();

          // Convert to number if parameter type is number or integer
          const paramType = parameterTypes[newParam];
          if (paramType === 'number' || paramType === 'integer') {
            const numValue = Number(trimmedValue);
            return isNaN(numValue) ? trimmedValue : numValue;
          }

          return trimmedValue;
        });

        setSweepConfig((prev) => ({
          ...prev,
          [newParam]: valuesArray,
        }));

        // Reset input fields
        setNewParam('');
        setNewValues('');
      }
    };

    const removeParam = (paramToRemove) => {
      setSweepConfig((prev) => {
        const updated = { ...prev };
        delete updated[paramToRemove];
        return updated;
      });
    };

    return (
      <Stack spacing={3}>
        <Sheet sx={{ p: 2, borderRadius: 'sm' }} variant="outlined">
          <Stack spacing={2}>
            <FormLabel>Add Parameter Sweep</FormLabel>
            <FormHelperText>
              Define parameters to sweep during training. Each parameter can
              have multiple values to try. Selecting a hyperparameter will
              override the values set for it in the Plugin Config tab.
            </FormHelperText>

            <Stack direction="row" spacing={2} alignItems="flex-start">
              <FormControl sx={{ minWidth: '200px' }}>
                <FormLabel>Parameter</FormLabel>
                <select
                  value={newParam}
                  onChange={(e) => setNewParam(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    width: '100%',
                    backgroundColor: 'transparent',
                  }}
                >
                  <option value="">Select a parameter</option>
                  {unusedParameters.map((param) => (
                    <option key={param} value={param}>
                      {param}
                    </option>
                  ))}
                </select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Sweep Values (comma separated)</FormLabel>
                <Input
                  value={newValues}
                  onChange={(e) => setNewValues(e.target.value)}
                  placeholder="e.g. 2,4,8,16"
                />
                <FormHelperText>
                  Enter values separated by commas
                </FormHelperText>
              </FormControl>

              <Button
                sx={{ mt: 3 }}
                onClick={addSweepParam}
                disabled={!newParam || !newValues.trim()}
              >
                Add Parameter
              </Button>
            </Stack>
          </Stack>
        </Sheet>

        {Object.keys(sweepConfig).length > 0 && (
          <Sheet sx={{ p: 2, borderRadius: 'sm' }} variant="outlined">
            <FormLabel>Current Sweep Configuration</FormLabel>
            <Stack spacing={2} mt={1}>
              {Object.entries(sweepConfig).map(([param, values]) => (
                <Sheet
                  key={param}
                  sx={{ p: 2, borderRadius: 'sm' }}
                  variant="soft"
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Stack>
                      <FormLabel>{param}</FormLabel>
                      <FormHelperText>
                        Values: {values.join(', ')}
                      </FormHelperText>
                    </Stack>
                    <Button
                      color="danger"
                      variant="soft"
                      size="sm"
                      onClick={() => removeParam(param)}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Sheet>
              ))}
            </Stack>
          </Sheet>
        )}

        <input
          type="hidden"
          name="sweep_config"
          value={JSON.stringify(sweepConfig)}
        />
      </Stack>
    );
  }

  return (
    <Modal open={open}>
      <ModalDialog
        sx={{
          width: '95dvw',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          top: '5dvh',
          overflow: 'auto',
          maxHeight: '92dvh',
          minHeight: '70dvh',
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
            let formJson = Object.fromEntries((formData as any).entries());
            formJson.type = trainingType;
            // Add sweep config to form data
            if (Object.keys(sweepConfig).length > 0) {
              formJson.sweep_config = JSON.stringify(sweepConfig);
            }
            console.log('Form Data:', formJson);
            if (templateData && task_id) {
              //Only update if we are currently editing a template
              // For all keys in templateData.inputs that are in formJson, set the value from formJson
              const templateDataInputs = JSON.parse(templateData.inputs);
              const templateDataOutputs = JSON.parse(templateData.outputs);
              for (const key in templateDataInputs) {
                if (
                  key in formJson &&
                  templateDataInputs[key] != formJson[key]
                ) {
                  templateDataInputs[key] = formJson[key];
                }
              }
              // For all keys in templateData.outputs that are in formJson, set the value from formJson
              for (const key in templateDataOutputs) {
                if (
                  key in formJson &&
                  templateDataOutputs[key] != formJson[key]
                ) {
                  templateDataOutputs[key] = formJson[key];
                }
              }

              updateTask(
                task_id,
                JSON.stringify(templateDataInputs),
                JSON.stringify(formJson),
                JSON.stringify(templateDataOutputs),
              );
              templateMutate(); //Need to mutate template data after updating
            } else {
              createNewTask(
                formJson.template_name,
                formJson.plugin_name,
                experimentInfo?.id,
                JSON.stringify({
                  model_name: formJson.model_name,
                  model_architecture: formJson.model_architecture,
                  dataset_name: formJson.dataset_name,
                }),
                JSON.stringify(formJson),
                JSON.stringify({
                  adaptor_name: formJson.adaptor_name,
                }),
              );
            }
            setNameInput(generateFriendlyName());
            setSweepConfig({});
            onClose();
          }}
        >
          <Tabs
            aria-label="Training Template Tabs"
            value={currentTab}
            onChange={(event, newValue) => setCurrentTab(newValue)}
            sx={{ borderRadius: 'lg', display: 'flex', overflow: 'hidden' }}
          >
            <TabList>
              <Tab>Introduction</Tab>
              <Tab>Name</Tab>
              <Tab>Dataset</Tab>
              <Tab>Data Template</Tab>
              <Tab>Plugin Config</Tab>
              {runSweeps && <Tab>Sweep Config</Tab>}
            </TabList>
            <TabPanel value={0} sx={{ p: 2, overflow: 'auto' }}>
              <PluginIntroduction
                experimentInfo={experimentInfo}
                pluginId={pluginId}
              />
            </TabPanel>
            <TabPanel value={1} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <TrainingModalFirstTab />
            </TabPanel>
            <TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <TrainingModalDataTemplatingTab
                selectedDataset={selectedDataset}
                currentDatasetInfo={currentDatasetInfo}
                templateData={templateData}
                injectIntoTemplate={injectIntoTemplate}
                experimentInfo={experimentInfo}
                pluginId={pluginId}
              />
            </TabPanel>
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <>
                {currentTab === 2 && (
                  <OneTimePopup title="How to Create a Training Template:">
                    Use the <b>Available Fields</b> to populate the template
                    fields on this screen. For each template field, you can type
                    any text, and when you want to inject text from your
                    dataset, add the field name, surrounded with curly braces
                    like this: &#123;&#123; example &#125;&#125; .
                    <br />
                    <br />
                    <img
                      src={AvailableFieldsImage}
                      alt="Available Fields"
                      width="400"
                    />
                    <br />
                    <br />
                    The Avaiable Fields will change dynamically based on the
                    columns in your selected dataset.
                  </OneTimePopup>
                )}

                <TrainingModalDataTab
                  datasetsIsLoading={datasetsIsLoading}
                  datasets={datasets}
                  selectedDataset={selectedDataset}
                  setSelectedDataset={setSelectedDataset}
                  currentDatasetInfoIsLoading={currentDatasetInfoIsLoading}
                  currentDatasetInfo={currentDatasetInfo}
                  templateData={templateData}
                  injectIntoTemplate={injectIntoTemplate}
                  experimentInfo={experimentInfo}
                  pluginId={pluginId}
                />
              </>
            </TabPanel>
            <TabPanel value={4} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={pluginId}
                config={config}
              />
            </TabPanel>
            {runSweeps && (
              <TabPanel value={5} sx={{ p: 2, overflow: 'auto' }} keepMounted>
                <SweepConfigTab
                  trainingTypeData={trainingTypeData}
                  sweepConfig={sweepConfig}
                  setSweepConfig={setSweepConfig}
                />
              </TabPanel>
            )}
          </Tabs>
          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button color="danger" variant="soft" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="soft" type="submit" color="success">
              Save Training Template
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
