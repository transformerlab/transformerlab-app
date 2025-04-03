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
import { generateFriendlyName } from 'renderer/lib/utils';
import DynamicPluginForm from '../DynamicPluginForm';
import TrainingModalDataTab from '../Train/TraningModalDataTab';

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
    <Markdown remarkPlugins={[remarkGfm]} className="editableSheetContent">
      {data && data !== 'FILE NOT FOUND'
        ? data
        : 'No description for this plugin is availabe.'}
    </Markdown>
  );
}

async function updateTask(
  task_id: string,
  inputs: string,
  config: string,
  outputs: string,
) {
  const configBody = {
    inputs,
    config,
    outputs,
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
    name,
    plugin,
    experiment_id: experimentId,
    inputs,
    config,
    outputs,
    type: 'EVAL',
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

export default function EvalModal({
  open,
  onClose,
  experimentInfo,
  mutateTasks,
  pluginId,
  currentEvalId,
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  mutateTasks: () => void;
  pluginId: string;
  currentEvalId?: string; // Optional incase of new evaluation
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [config, setConfig] = useState({});
  const [hasDatasetKey, setHasDatasetKey] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);
  const [datasetDisplayMessage, setDatasetDisplayMessage] = useState('');

  // Fetch available datasets from the API
  const {
    data: datasets,
    error: datasetsError,
    isLoading: datasetsIsLoading,
  } = useSWR(chatAPI.Endpoints.Dataset.LocalList(), fetcher);

  const {
    data: evalData,
    error: evalError,
    isLoading: evalIsLoading,
  } = useSWR(chatAPI.Endpoints.Tasks.GetByID(currentEvalId), fetcher);

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

  const { data: currentDatasetInfo, isLoading: currentDatasetInfoIsLoading } =
    useSWR(() => {
      if (selectedDataset === null) {
        return null;
      }
      return chatAPI.Endpoints.Dataset.Info(selectedDataset);
    }, fetcher);

  // useEffect(() => {
  //   if (open) { // Reset the name input when the modal is opened
  //     setNameInput(generateFriendlyName());
  //   }}, []);

  useEffect(() => {
    if (open) {
      if (!currentEvalId || currentEvalId === '') {
        setNameInput(generateFriendlyName());
      }
    } else {
      setNameInput('');
      setHasDatasetKey(false);
    }
  }, [open]);

  useEffect(() => {
    if (experimentInfo && pluginId) {
      if (
        evalData &&
        evalData !== undefined &&
        currentEvalId &&
        currentEvalId !== ''
      ) {
        const evalConfig = JSON.parse(evalData.config);
        if (evalConfig) {
          setConfig(evalConfig);
          const datasetKeyExists = Object.keys(
            evalConfig,
          ).some((key) => key === 'dataset_name');
          setHasDatasetKey(datasetKeyExists);
          if (
            evalConfig._dataset_display_message &&
            evalConfig._dataset_display_message.length > 0
          ) {
            setDatasetDisplayMessage(
              evalConfig._dataset_display_message,
            );
          }
          const tasksKeyExists = Object.keys(evalConfig).some(
            (key) => key.toLowerCase().includes('tasks'),
          );
          if (tasksKeyExists) {
            evalConfig.tasks =
              evalConfig.tasks.split(',');
            setConfig(evalConfig);
          }

          if (
            hasDatasetKey &&
            evalConfig.dataset_name.length > 0
          ) {
            setSelectedDataset(evalConfig.dataset_name);
          }
          if (!nameInput && evalConfig?.run_name.length > 0) {
            setNameInput(evalConfig.run_name);
          }
        }
        // if (!nameInput && evalConfig?.script_parameters.run_name) {
        //   setNameInput(evalConfig.script_parameters.run_name);
        // }
      } else if (data) {
        let parsedData;
        try {
          parsedData = JSON.parse(data); //Parsing data for easy access to parameters}
          // Set config as a JSON object with keys of the parameters and values of the default values
          let tempconfig: { [key: string]: any } = {};
          if (parsedData && parsedData.parameters) {
            tempconfig = Object.fromEntries(
              Object.entries(parsedData.parameters).map(([key, value]) => [
                key,
                value.default,
              ]),
            );
            if (parsedData && parsedData._dataset) {
              setHasDatasetKey(true);
              // Check if the dataset display message string length is greater than 0
              if (
                parsedData._dataset_display_message &&
                parsedData._dataset_display_message.length > 0
              ) {
                setDatasetDisplayMessage(parsedData._dataset_display_message);
                // Add dataset display message to the config parameters
              }
            }

            setConfig(tempconfig);
            // Set hasDataset to true in the parsed data, the dataset key is `true`
            // If tempconfig is not an empty object
            // if (tempconfig && Object.keys(tempconfig).length > 0) {
            //   setNameInput(generateFriendlyName());
            // }
          }
        } catch (e) {
          console.error('Error parsing data', e);
          parsedData = '';
        }
      }
    }
  }, [experimentInfo, pluginId, currentEvalId, nameInput, data]);

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

  // Set config to the plugin config if it is available based on currentEvalId within experiment info

  // eslint-disable-next-line react/no-unstable-nested-components
  function TrainingModalFirstTab() {
    return (
      <Stack spacing={2}>
        <FormControl>
          <FormLabel>Evaluation Task Name</FormLabel>
          <Input
            required
            autoFocus
            value={nameInput} //Value needs to be stored in a state variable otherwise it will not update on change/update
            onChange={(e) => setNameInput(e.target.value)}
            name="template_name"
            size="lg"
          />
          <FormHelperText>
            Give this specific evaluation recipe a unique name
          </FormHelperText>
        </FormControl>
        <FormLabel>Info</FormLabel>
        <Sheet color="neutral" variant="soft">
          <Stack direction="column" justifyContent="space-evenly" gap={2} p={2}>
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
          </Stack>
        </Sheet>
      </Stack>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formJson = Object.fromEntries((formData as any).entries());
    // Add an extra field in formJson for datasetDisplayMessage
    if (datasetDisplayMessage.length > 0) {
      formJson._dataset_display_message = datasetDisplayMessage;
    }
    try {
      if (!formJson.run_name) {
        formJson.run_name = formJson.template_name;
      }
      if (!formJson.predefined_tasks) {
        formJson.predefined_tasks = '';
      }
      formJson.script_parameters = JSON.parse(JSON.stringify(formJson));

      // Run when the currentEvalId is provided
      if (currentEvalId && currentEvalId !== '') {
        await updateTask(currentEvalId, '{}', JSON.stringify(formJson), '{}');
        setNameInput('');
        setHasDatasetKey(false);
      } else {
        const template_name = formJson.template_name;
        // delete formJson.template_name;
        await createNewTask(
          template_name,
          pluginId,
          experimentInfo?.id,
          '{}',
          JSON.stringify(formJson),
          '{}',
        );
        // alert(JSON.stringify(formJson, null, 2));
        setNameInput(generateFriendlyName());
        setHasDatasetKey(false);
      }
      mutateTasks();
      onClose();

      // };
      // }
      // const result = await chatAPI.EXPERIMENT_EDIT_EVALUATION(experimentInfo?.id, currentEvalId, formJson)
      // // alert(JSON.stringify(formJson, null, 2));
      // setNameInput(generateFriendlyName());
      // onClose();
    } catch (error) {
      console.error('Failed to edit evaluation:', error);
    }
  };

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
          id="evaluation-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={handleSubmit}
        >
          <Tabs
            aria-label="evaluation Template Tabs"
            value={currentTab}
            onChange={(event, newValue) => setCurrentTab(newValue)}
            sx={{ borderRadius: 'lg', display: 'flex', overflow: 'hidden' }}
          >
            <TabList>
              <Tab>Introduction</Tab>
              <Tab>Name</Tab>
              <Tab>Plugin Config</Tab>
              {hasDatasetKey && <Tab>Dataset</Tab>}
            </TabList>
            <TabPanel value={0} sx={{ p: 2, overflow: 'auto' }}>
              <PluginIntroduction
                experimentInfo={experimentInfo}
                pluginId={pluginId}
              />
            </TabPanel>
            <TabPanel
              value={1}
              sx={{ p: 2, overflow: 'auto', maxWidth: '500px' }}
              keepMounted
            >
              <TrainingModalFirstTab />
            </TabPanel>
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={pluginId}
                config={config}
              />
            </TabPanel>
            {hasDatasetKey && (
              <TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
                <TrainingModalDataTab
                  datasetsIsLoading={datasetsIsLoading}
                  datasets={datasets}
                  selectedDataset={selectedDataset}
                  setSelectedDataset={setSelectedDataset}
                  currentDatasetInfoIsLoading={currentDatasetInfoIsLoading}
                  currentDatasetInfo={currentDatasetInfo}
                  templateData={null}
                  injectIntoTemplate={null}
                  experimentInfo={experimentInfo}
                  pluginId={pluginId}
                  displayMessage={datasetDisplayMessage}
                />
              </TabPanel>
            )}
          </Tabs>
          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button color="danger" variant="soft" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="soft" type="submit" color="success">
              Save Evaluation Task
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
