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
  Textarea,
} from '@mui/joy';
import DynamicPluginForm from '../DynamicPluginForm';
import TrainingModalDataTab from '../Train/TraningModalDataTab';
import PickADocumentMenu from '../Rag/PickADocumentMenu';

import { generateFriendlyName } from 'renderer/lib/utils';

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

/* This function looks at all the generations that are stored in the experiment JSON
and returns the generation that matches the generationName */
function getGenerationFromGenerationsArray(generationsStr, generationName) {
  let thisGeneration = null;
  console.log(generationName);

  if (typeof generationsStr === 'string') {
    try {
      const generations = JSON.parse(generationsStr);
      console.log('generations:', generations);

      if (Array.isArray(generations)) {
        thisGeneration = generations.find(
          (generation) => generation.name === generationName,
        );
      }
    } catch (error) {
      console.error('Failed to parse generations JSON string:', error);
    }
  }
  console.log('thisGeneration', thisGeneration);
  return thisGeneration;
}

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
    type: 'GENERATE',
  };
  console.log(configBody);
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

export default function GenerateModal({
  open,
  onClose,
  experimentInfo,
  experimentInfoMutate,
  pluginId,
  currentGenerationId,
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  experimentInfoMutate: () => void;
  template_id?: string;
  pluginId: string;
  currentGenerationId?: string; // Optional incase of new generation
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [config, setConfig] = useState({});
  const [hasDatasetKey, setHasDatasetKey] = useState(false);
  const [hasDocumentsKey, setHasDocumentsKey] = useState(false);
  const [hasContextKey, setHasContextKey] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);
  const [contextInput, setContextInput] = useState('');
  const [datasetDisplayMessage, setDatasetDisplayMessage] = useState('');

  // Fetch available datasets from the API
  const {
    data: datasets,
    error: datasetsError,
    isLoading: datasetsIsLoading,
  } = useSWR(chatAPI.Endpoints.Dataset.LocalList(), fetcher);
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
    data: generationData,
    error: generationError,
    isLoading: generationIsLoading,
  } = useSWR(
    currentGenerationId
      ? chatAPI.Endpoints.Tasks.GetByID(currentGenerationId)
      : null,
    fetcher,
  );

  const { data: currentDatasetInfo, isLoading: currentDatasetInfoIsLoading } =
    useSWR(() => {
      if (selectedDataset === null) {
        return null;
      }
      return chatAPI.Endpoints.Dataset.Info(selectedDataset);
    }, fetcher);

  useEffect(() => {
    if (open) {
      if (!currentGenerationId || currentGenerationId === '') {
        setNameInput(generateFriendlyName());
      } else {
        setNameInput('');
        setHasContextKey(false);
        setHasDocumentsKey(false);
        setHasDatasetKey(false);
        setSelectedDocs([]);
        setContextInput('');
        setSelectedDataset(null);
      }
    }
  }, [open]);

  useEffect(() => {
    // EDIT GENERATION
    if (experimentInfo && pluginId) {
      if (
        generationData &&
        generationData !== undefined &&
        currentGenerationId &&
        currentGenerationId != ''
      ) {
        console.log(currentGenerationId);
        console.log(generationData);
        const generationConfig = JSON.parse(generationData.config);
        if (generationConfig) {
          setConfig(generationConfig.script_parameters);

          const datasetKeyExists = Object.keys(
            generationConfig,
          ).some((key) => key === 'dataset_name');

          const docsKeyExists = Object.keys(
            generationConfig,
          ).some((key) => key === 'docs');

          const contextKeyExists = Object.keys(
            generationConfig,
          ).some((key) => key === 'context');

          setHasDatasetKey(datasetKeyExists);

          if (
            docsKeyExists &&
            generationConfig.docs.length > 0
          ) {
            setHasContextKey(false);
            setHasDocumentsKey(true);
            generationConfig.docs =
              generationConfig.docs.split(',');
            setConfig(generationConfig);
            setSelectedDocs(generationConfig.docs);
          } else if (
            contextKeyExists &&
            generationConfig.context.length > 0
          ) {
            setHasContextKey(true);
            setHasDocumentsKey(false);
            const context = generationConfig.context;
            setContextInput(context);
            delete generationConfig.context;
            setConfig(generationConfig);
          }

          if (
            hasDatasetKey &&
            generationConfig.script_parameters.dataset_name
          ) {
            setSelectedDataset(generationConfig.script_parameters.dataset_name);
          }
          if (
            generationConfig.script_parameters._dataset_display_message &&
            generationConfig.script_parameters._dataset_display_message.length >
              0
          ) {
            setDatasetDisplayMessage(
              generationConfig.script_parameters._dataset_display_message,
            );
          }
          if (!nameInput && generationData?.name.length > 0) {
            setNameInput(generationData.name);
          }
        }
      } else {
      // CREATE NEW GENERATION
      if (data) {
        let parsedData;
        try {
          parsedData = JSON.parse(data); //Parsing data for easy access to parameters}
          // Set config as a JSON object with keys of the parameters and values of the default values
          setSelectedDocs([]);
          let tempconfig: { [key: string]: any } = {};
          if (parsedData && parsedData.parameters) {
            tempconfig = Object.fromEntries(
              Object.entries(parsedData.parameters).map(([key, value]) => [
                key,
                value.default,
              ]),
            );
            // Logic to set dataset message
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
            // Check if parsed data parameters has a key that includes 'docs'
            const docsKeyExists = Object.keys(parsedData.parameters).some(
              (key) => key.toLowerCase().includes('tflabcustomui_docs'),
            );

            const contextKeyExists = Object.keys(parsedData.parameters).some(
              (key) => key.toLowerCase().includes('tflabcustomui_context'),
            );
            setHasContextKey(contextKeyExists);
            setHasDocumentsKey(docsKeyExists);
          }
          setConfig(tempconfig);
        } catch (e) {
          console.error('Error parsing data', e);
          parsedData = '';
        }
      }}
    }
  }, [experimentInfo, pluginId, currentGenerationId, nameInput, data]);

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

  // Set config to the plugin config if it is available based on currentGenerationId within experiment info

  function TrainingModalFirstTab() {
    return (
      <Stack spacing={2}>
        <FormControl>
          <FormLabel>Generation Task Name</FormLabel>
          <Input
            required
            autoFocus
            value={nameInput} //Value needs to be stored in a state variable otherwise it will not update on change/update
            onChange={(e) => setNameInput(e.target.value)}
            name="template_name"
            size="lg"
          />
          <FormHelperText>
            Give this specific generation recipe a unique name
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

  function DocsTab({ experimentInfo }) {
    return (
      <Stack spacing={2}>
        <FormControl>
          <FormLabel>Pick Documents</FormLabel>
          <PickADocumentMenu
            experimentInfo={experimentInfo}
            showFoldersOnly={false}
            value={selectedDocs}
            onChange={setSelectedDocs}
            name="docs"
            required
          />
          <FormHelperText>Select documents to upload</FormHelperText>
        </FormControl>
      </Stack>
    );
  }

  function ContextTab({ contextInput, setContextInput }) {
    return (
      <Stack spacing={2}>
        <FormControl>
          <FormLabel>Context</FormLabel>
          <Textarea
            minRows={5}
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            name="context"
            style={{ width: '100%' }}
          />
          <FormHelperText>
            Provide context for the generation task
          </FormHelperText>
        </FormControl>
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

      if (hasDocumentsKey && formJson.docs.length > 0) {
        formJson.docs = JSON.parse(formJson.docs);
        formJson.docs = formJson.docs.join(',');
        formJson.generation_type = 'docs';
      }
      // Add context to the formJson
      else if (hasContextKey && contextInput.length > 0) {
        formJson.context = contextInput;
        formJson.generation_type = 'context';
      } else {
        formJson.generation_type = 'scratch';
      }
      formJson.script_parameters = JSON.parse(JSON.stringify(formJson));

      console.log('formJson', formJson);

      // Run when the currentGenerationId is provided
      if (currentGenerationId && currentGenerationId !== '') {
        await updateTask(
          currentGenerationId,
          '{}',
          JSON.stringify(formJson),
          '{}',
        );
        setNameInput(generateFriendlyName());
        setContextInput('');
      } else {
        const template_name = formJson.template_name;
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
      }
      experimentInfoMutate();
      onClose();
    } catch (error) {
      console.error('Failed to edit generation:', error);
    }
  };

  return (
    <Modal open={open}>
      <ModalDialog
        sx={{
          width: '80dvw',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          top: '5dvh',
          overflow: 'auto',
          maxHeight: '90dvh',
          minHeight: '70dvh',
          height: '100%',
        }}
      >
        <form
          id="generation-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={handleSubmit}
        >
          <Tabs
            aria-label="generation Template Tabs"
            value={currentTab}
            onChange={(event, newValue) => setCurrentTab(newValue)}
            sx={{ borderRadius: 'lg', display: 'flex', overflow: 'hidden' }}
          >
            <TabList>
              <Tab>Introduction</Tab>
              <Tab>Name</Tab>
              <Tab>Plugin Config</Tab>
              {hasDocumentsKey && <Tab>Documents</Tab>}
              {hasContextKey && <Tab>Context</Tab>}
              {hasDatasetKey && <Tab>Dataset</Tab>}
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
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={pluginId}
                config={config}
              />
            </TabPanel>
            {hasDocumentsKey && (
              <TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
                <DocsTab experimentInfo={experimentInfo} />
                {/* <PickADocumentMenu
                  experimentInfo={experimentInfo}
                  /> */}
              </TabPanel>
              // <DocsTab />
            )}
            {hasContextKey && (
              <TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
                <ContextTab
                  contextInput={contextInput}
                  setContextInput={setContextInput}
                />
              </TabPanel>
            )}
            {hasDatasetKey && (
              <TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
                <>
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
                </>
              </TabPanel>
            )}
          </Tabs>
          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button color="danger" variant="soft" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="soft" type="submit" color="success">
              Save Generation Task
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
