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

const DefaultPluginConfig = {
  model_quant_bits: 4,
};

const fetcher = (url) => fetch(url).then((res) => res.json());

// create a default output model name that can be overridden in the UI
function defaultOutputModelName(input_model_name, plugin_info) {
    console.log(input_model_name);
    console.log(plugin_info)
    return input_model_name + plugin_info;
}

export default function PluginSettingsModal({ open, onClose, experimentInfo, pluginId }) {

  const [selectedPlugin, setSelectedPlugin] = useState(null);
  const [config, setConfig] = useState(DefaultPluginConfig);

  const currentModelName = experimentInfo?.config?.foundation;

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
            /**chatAPI.RunExport(
              experimentInfo?.id,
              pluginId,
              JSON.stringify(formJson)
            );*/
            onClose();
          }}
        >
         
          <Stack spacing={2}>
            <FormControl>
                  <FormLabel>Output Model Name</FormLabel>
                  <Input
                    required
                    autoFocus
                    placeholder={defaultOutputModelName(currentModelName, pluginId)}
                    name="template_name"
                    size="lg"
                  />
                  <FormHelperText>
                    This is the name the model will have in the Local Models list
                  </FormHelperText>
                </FormControl><FormControl>
            </FormControl>
            <Stack direction="row" justifyContent="space-evenly" gap={2}>
                <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Exporter plugin:</FormLabel>
                    <Typography variant="soft">{pluginId}</Typography>
                </FormControl>
                <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Export Architecture:</FormLabel>
                    <Typography variant="soft">
                      {""}
                    </Typography>
                </FormControl>

                <input
                    hidden
                    value={pluginId}
                    name="plugin_name"
                    readOnly
                />
                <input
                    hidden
                    value={
                      ""
                    }
                    name="plugin_other"
                    readOnly
                />
            </Stack>
            <Stack direction="row" justifyContent="space-evenly" gap={2}>
                <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Input Model:</FormLabel>
                    <Typography variant="soft">{currentModelName}</Typography>
                </FormControl>
                <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Input Architecture:</FormLabel>
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
            {/** 
            <DynamicPluginForm
                experimentInfo={experimentInfo}
                plugin={selectedPlugin}
            />
            */}
          </Stack>
          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button color="danger" variant="soft" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="soft" type="submit">
              Export
            </Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
