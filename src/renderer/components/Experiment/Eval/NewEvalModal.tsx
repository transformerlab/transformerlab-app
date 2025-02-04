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
import TrainingModalDataTab from '../Train/TraningModalDataTab';

import { generateFriendlyName } from 'renderer/lib/utils';
import exp from 'node:constants';
const fetcher = (url) => fetch(url).then((res) => res.json());

function PluginIntroduction({ experimentInfo, pluginId }) {
  const { data, error, isLoading } = useSWR(
    chatAPI.Endpoints.Experiment.ScriptGetFile(
      experimentInfo?.id,
      pluginId,
      'info.md'
    ),
    fetcher
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
  pluginId,
  currentEvalName,
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  template_id?: string;
  pluginId: string;
  currentEvalName: string;
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [config, setConfig] = useState({});
  const [hasDatasetKey, setHasDatasetKey] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

  useEffect(() => {
    setNameInput(generateFriendlyName());
  }, []);

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

useEffect(() => {
    if (data) {
    let parsedData;
    try {
        parsedData = JSON.parse(data); //Parsing data for easy access to parameters}
        // Set config as a JSON object with keys of the parameters and values of the default values
        let tempconfig = {};
        if (parsedData && parsedData.parameters) {
            tempconfig = Object.fromEntries(
            Object.entries(parsedData.parameters).map(([key, value]) => [
            key,
            value.default,
            ])
        );
        }
        setConfig(tempconfig);
        // Set hasDataset to true in the parsed data, the dataset key is `true`
        if (parsedData && parsedData.dataset) {
            setHasDatasetKey(true);
        }


    } catch (e) {
        console.error('Error parsing data', e);
        parsedData = '';
    }
    }
    }, [pluginId, experimentInfo, config, data]);


  // Fetch available datasets from the API
  const {
    data: datasets,
    error: datasetsError,
    isLoading: datasetsIsLoading,
  } = useSWR(chatAPI.Endpoints.Dataset.LocalList(), fetcher);

  const { data: currentDatasetInfo, isLoading: currentDatasetInfoIsLoading } =
    useSWR(() => {
      if (selectedDataset === null) {
        return null;
      }
      return chatAPI.Endpoints.Dataset.Info(selectedDataset);
    }, fetcher);

  // Set config to the plugin config if it is available based on currentEvalName within experiment info
  useEffect(() => {
    if (experimentInfo && currentEvalName && pluginId) {
      const evaluationsStr = experimentInfo.config?.evaluations;
      if (typeof evaluationsStr === 'string') {
        try {
          const evaluations = JSON.parse(evaluationsStr);
          if (Array.isArray(evaluations)) {
            const evalConfig = evaluations.find(
              (evalItem: any) =>
                evalItem.name === currentEvalName &&
                evalItem.plugin === pluginId
            );
            if (evalConfig) {
              setConfig(evalConfig.script_parameters);
            }
          }
        } catch (error) {
          console.error('Failed to parse evaluations JSON string:', error);
        }
      }
    }
  }, [experimentInfo, currentEvalName, pluginId]);

//   console.log('Experiment Info:', experimentInfo);
//   console.log("Current Eval Name:", currentEvalName);
//   console.log("Plugin ID:", pluginId);
//   console.log("Config:", config);
//   console.log("EXP CONFIG", experimentInfo?.config);

//   // Function to check if any key in the config contains the word "dataset"
//   const hasDatasetKey = (config: any) => {
//     return Object.keys(config).some(key => key.toLowerCase().includes('dataset'));
//   };

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

  // Set config to the plugin config if it is available based on currentEvalName within experiment info

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
    try {
      if (!formJson.run_name) {
        formJson.run_name = formJson.template_name;
      }
      // Remove the template_name key from a formJson object
      const template_name = formJson.template_name;
      delete formJson.template_name;

      const result = await chatAPI.EXPERIMENT_ADD_EVALUATION(experimentInfo?.id, template_name, pluginId, formJson);
    //   alert(JSON.stringify(formJson, null, 2));
      onClose();
    } catch (error) {
      console.error('Failed to edit evaluation:', error);
    }
  };

  return (
    <Modal open={open}>
      <ModalDialog
        sx={{
          width: '70dvw',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          top: '5dvh',
          overflow: 'auto',
          maxHeight: '70dvh',
          minHeight: '60dvh',
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
            <TabPanel value={1} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <TrainingModalFirstTab />
            </TabPanel>
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
              <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={pluginId}
              />
            </TabPanel>
            {hasDatasetKey && (<TabPanel value={3} sx={{ p: 2, overflow: 'auto' }} keepMounted>
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
              Save Evaluation Task
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
