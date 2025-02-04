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

import AvailableFieldsImage from 'renderer/img/show-available-fields.png';

import { generateFriendlyName } from 'renderer/lib/utils';
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
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  template_id?: string;
  pluginId: string;
}) {
  // Store the current selected Dataset in this modal
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [config, setConfig] = useState({});
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

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

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

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
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries((formData as any).entries());

            setNameInput(generateFriendlyName());
            alert(JSON.stringify(formJson, null, 2));
            onClose();
          }}
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
              <Tab>Dataset</Tab>
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
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
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
              Save Evaluation Task
            </Button>
          </Stack>
        </form>
        {/* {JSON.stringify(config, null, 2)} */}
      </ModalDialog>
    </Modal>
  );
}
