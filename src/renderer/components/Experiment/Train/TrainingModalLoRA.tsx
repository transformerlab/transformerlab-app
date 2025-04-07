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
  //Whenever template data updates, we need to update state variables used in the form.
  useEffect(() => {
    if (templateData && typeof templateData.config === 'string') {
      //Should only parse data once after initial load
      templateData.config = JSON.parse(templateData.config);
    }
    if (templateData && templateData.config) {
      setSelectedDataset(templateData.config.dataset_name);
      setConfig(templateData.config);
      setNameInput(templateData.name);
    } else {
      //This case is for when we are creating a new template
      setSelectedDataset(null);
      setConfig({});
      setNameInput(generateFriendlyName());
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
                {currentTab == 2 && (
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
