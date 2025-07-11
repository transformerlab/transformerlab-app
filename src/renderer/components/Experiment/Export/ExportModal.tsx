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
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import DynamicPluginForm from '../DynamicPluginForm';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function PluginIntroduction({
  experimentInfo,
  pluginId,
}: {
  experimentInfo: any;
  pluginId: string;
}) {
  const { data } = useSWR(
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
        : 'No description for this plugin is available.'}
    </Markdown>
  );
}

function ExportModalFirstTab({
  nameInput,
  setNameInput,
  pluginId,
  experimentInfo,
}: {
  nameInput: string;
  setNameInput: (value: string) => void;
  pluginId: string;
  experimentInfo: any;
}) {
  const currentModel = experimentInfo?.config?.foundation_filename
    ? experimentInfo?.config?.foundation_filename
    : experimentInfo?.config?.foundation;

  return (
    <Stack spacing={2}>
      <FormControl>
        <FormLabel>Export Task Name</FormLabel>
        <Input
          required
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          name="template_name"
          size="lg"
        />
        <FormHelperText>
          Give this specific export task a unique name
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
          <input
            hidden
            value={experimentInfo?.config?.adaptor}
            name="model_adapter"
            readOnly
          />
        </Stack>
      </Sheet>
    </Stack>
  );
}

async function updateTask(
  taskId: string,
  name: string,
  inputs: string,
  config: string,
  outputs: string,
) {
  const configBody = {
    name,
    inputs,
    config,
    outputs,
  };
  const response = await fetch(chatAPI.Endpoints.Tasks.UpdateTask(taskId), {
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
    type: 'EXPORT',
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

export default function ExportModal({
  open,
  onClose,
  experimentInfo,
  mutateTasks,
  pluginId,
  currentExportId = '',
}: {
  open: boolean;
  onClose: () => void;
  experimentInfo: any;
  mutateTasks: () => void;
  pluginId: string;
  currentExportId?: string;
}) {
  const [config, setConfig] = useState({});
  const [nameInput, setNameInput] = useState('');
  const [currentTab, setCurrentTab] = useState(0);

  const { data: exportData } = useSWR(
    currentExportId ? chatAPI.Endpoints.Tasks.GetByID(currentExportId) : null,
    fetcher,
  );

  const { data } = useSWR(
    experimentInfo?.id &&
      pluginId &&
      chatAPI.Endpoints.Experiment.ScriptGetFile(
        experimentInfo?.id,
        pluginId,
        'index.json',
      ),
    fetcher,
  );

  useEffect(() => {
    if (open) {
      if (!currentExportId || currentExportId === '') {
        setNameInput(generateFriendlyName());
      }
    } else {
      setNameInput('');
    }
  }, [open, currentExportId]);

  useEffect(() => {
    if (experimentInfo && pluginId) {
      if (
        exportData &&
        exportData !== undefined &&
        currentExportId &&
        currentExportId !== ''
      ) {
        const exportConfig = JSON.parse(exportData.config);
        if (exportConfig) {
          setConfig(exportConfig);
          if (!nameInput && exportData?.name) {
            setNameInput(exportData.name);
          }
        }
      } else if (data) {
        let parsedData;
        try {
          parsedData = JSON.parse(data);
          let tempconfig: { [key: string]: any } = {};
          if (parsedData && parsedData.parameters) {
            tempconfig = Object.fromEntries(
              Object.entries(parsedData.parameters).map(
                ([key, value]: [string, any]) => [key, value.default],
              ),
            );
            setConfig(tempconfig);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Error parsing data', e);
          parsedData = '';
        }
      }
    }
  }, [experimentInfo, pluginId, currentExportId, exportData, data, nameInput]);

  if (!experimentInfo?.id) {
    return 'Select an Experiment';
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formJson = Object.fromEntries((formData as any).entries());

    // Ensure nameInput state is captured as template_name (override form data)
    formJson.template_name = nameInput;

    // Ensure all the hidden fields are captured
    formJson.plugin_name = pluginId;
    formJson.model_name = experimentInfo?.config?.foundation_filename
      ? experimentInfo?.config?.foundation_filename
      : experimentInfo?.config?.foundation;
    formJson.model_architecture =
      experimentInfo?.config?.foundation_model_architecture;
    formJson.model_adapter = experimentInfo?.config?.adaptor;

    try {
      // Get experiment data for building the export configuration
      const expResponse = await fetch(
        chatAPI.Endpoints.Experiment.Get(experimentInfo?.id),
      );
      const experiment = await expResponse.json();
      const expConfig = SafeJSONParse(experiment.config, {} as any);

      // Build export configuration
      const inputModelId = expConfig.foundation;
      const inputModelIdWithoutAuthor = inputModelId.split('/').pop();
      const conversionTime = Math.floor(Date.now() / 1000);

      // Parse plugin parameters
      const pluginParams = Object.fromEntries(
        Object.entries(formJson).filter(
          ([key]) =>
            ![
              'template_name',
              'plugin_name',
              'model_name',
              'model_architecture',
              'model_adapter',
            ].includes(key),
        ),
      );

      // Determine output type/quantization
      let qType = '';
      if (pluginParams.outtype) qType = pluginParams.outtype as string;
      else if (pluginParams.q_bits) qType = `${pluginParams.q_bits}bit`;

      // Determine plugin architecture (this would ideally come from the plugin config)
      const pluginArchitecture = 'GGUF'; // Default, should be extracted from plugin metadata

      let outputModelId = `${pluginArchitecture}-${inputModelIdWithoutAuthor}-${conversionTime}`;
      if (qType) outputModelId += `-${qType}`;

      if (pluginArchitecture === 'GGUF') {
        outputModelId = `${inputModelIdWithoutAuthor}-${conversionTime}${qType ? `-${qType}` : ''}.gguf`;
      }

      const exportConfig = {
        plugin_name: pluginId,
        input_model_id: inputModelId,
        input_model_path: expConfig.foundation_filename || inputModelId,
        input_model_architecture: expConfig.foundation_model_architecture,
        output_model_id: outputModelId,
        output_model_architecture: pluginArchitecture,
        output_model_name: `${inputModelIdWithoutAuthor} - ${pluginArchitecture}${qType ? ` - ${qType}` : ''}`,
        output_model_path: `/models/${outputModelId}`,
        output_filename: pluginArchitecture === 'GGUF' ? outputModelId : '',
        script_directory: `/plugins/${pluginId}`,
        params: pluginParams,
        run_name: formJson.template_name,
      };

      const inputs = JSON.stringify({
        input_model_id: inputModelId,
        input_model_path: expConfig.foundation_filename || inputModelId,
        input_model_architecture: expConfig.foundation_model_architecture,
        plugin_name: pluginId,
        plugin_architecture: pluginArchitecture,
      });

      const outputs = JSON.stringify({
        exported_model_path: `/models/${outputModelId}`,
        output_model_id: outputModelId,
        export_status: 'pending',
      });

      if (currentExportId && currentExportId !== '') {
        await updateTask(
          currentExportId,
          formJson.template_name as string,
          inputs,
          JSON.stringify(exportConfig),
          outputs,
        );
      } else {
        await createNewTask(
          formJson.template_name as string,
          pluginId,
          experimentInfo?.id,
          inputs,
          JSON.stringify(exportConfig),
          outputs,
        );
        setNameInput(generateFriendlyName());
      }

      mutateTasks();
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save export task:', error);
    }
  };

  return (
    <Modal open={open}>
      <ModalDialog
        sx={{
          width: '95dvw',
          transform: 'translateX(-50%)',
          top: '5dvh',
          overflow: 'auto',
          maxHeight: '92dvh',
          minHeight: '70dvh',
          height: '100%',
        }}
      >
        <form
          id="export-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={handleSubmit}
        >
          <Tabs
            aria-label="Export Task Tabs"
            value={currentTab}
            onChange={(event, newValue) => setCurrentTab(newValue as number)}
            sx={{ borderRadius: 'lg', display: 'flex', overflow: 'hidden' }}
          >
            <TabList>
              <Tab>Introduction</Tab>
              <Tab>Name</Tab>
              <Tab>Plugin Config</Tab>
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
              <ExportModalFirstTab
                nameInput={nameInput}
                setNameInput={setNameInput}
                pluginId={pluginId}
                experimentInfo={experimentInfo}
              />
            </TabPanel>
            <TabPanel value={2} sx={{ p: 2, overflow: 'auto' }} keepMounted>
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
              Save Export Task
            </Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
