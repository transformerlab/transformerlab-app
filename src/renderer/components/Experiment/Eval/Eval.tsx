/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';

import {
  Button,
  Typography,
  Modal,
  ModalDialog,
  ModalClose,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Option,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
  Alert,
} from '@mui/joy';
import { PlusCircleIcon } from 'lucide-react';
import { generateFriendlyName } from 'renderer/lib/utils';

import DynamicPluginForm from '../DynamicPluginForm';
import EvalJobsTable from './EvalJobsTable.tsx';
import EvalTasksTable from './EvalTasksTable';

function getTemplateParametersForPlugin(pluginName, plugins) {
  if (!pluginName || !plugins) {
    return [];
  }

  const plugin = plugins.find((row) => row.name === pluginName);
  if (plugin) {
    return plugin?.info?.template_parameters[0]?.options.map((row) => (
      <Option value={row} key={row}>
        {row}
      </Option>
    ));
  }
  return [];
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Eval({
  experimentInfo,
  addEvaluation,
  experimentInfoMutate,
}) {
  const [open, setOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState('');
  const [currentEvaluator, setCurrentEvaluator] = useState('');

  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'evaluator'
      ),
    fetcher
  );

  async function saveFile() {
    // const value = editorRef?.current?.getValue();

    if (value) {
      // Use fetch to post the value to the server
      await fetch(
        chatAPI.Endpoints.Experiment.SavePlugin(project, evalName, 'main.py'),
        {
          method: 'POST',
          body: value,
        }
      ).then(() => {});
    }
  }

  function openModalForPLugin(pluginId) {
    setSelectedPlugin(pluginId);
    setOpen(true);
  }

  if (!experimentInfo) {
    return 'No experiment selected';
  }

  console.log('ExperimentInfo', experimentInfo);

  return (
    <>
      <Sheet
        sx={{
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Plugins:
        {JSON.stringify(plugins)} */}

        <Modal open={open} onClose={() => setOpen(false)}>
          <ModalDialog>
            <ModalClose onClick={() => setOpen(false)} />
            {/* <DialogTitle>Add Evalation</DialogTitle> */}
            {/* <DialogContent>
              Select an evaluation to add to this experiment.
            </DialogContent> */}
            <form
              onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const formJson = Object.fromEntries(
                  (formData as any).entries()
                );
                // alert(JSON.stringify(formJson));

                /* The way evals are defined right now, they need a unique name. This is a hack
                  until we have a better solution */
                let nameOfThisEvaluation;
                if (formJson.run_name) {
                  nameOfThisEvaluation = formJson.run_name;
                } else {
                  nameOfThisEvaluation =
                    selectedPlugin + '_' + generateFriendlyName();
                }
                addEvaluation(selectedPlugin, nameOfThisEvaluation, formJson);
                setOpen(false);
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Evaluation Plugin Template:</FormLabel>
                  <Input readOnly variant="soft" value={selectedPlugin} />
                </FormControl>
                <DynamicPluginForm
                  experimentInfo={experimentInfo}
                  plugin={selectedPlugin}
                />
                <Button type="submit">Submit</Button>
              </Stack>
            </form>
          </ModalDialog>
        </Modal>
        {/* <Typography level="h1" mb={1}>
          Evaluate
        </Typography> */}
        <Typography level="h3" mb={1}>
          Evaluation Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Evaluation Scripts available, please install an evaluator plugin.
          </Alert>
        ) : (
          <Dropdown>
            <MenuButton
              startDecorator={<PlusCircleIcon />}
              variant="outlined"
              color="success"
              sx={{ width: 'fit-content', mb: 1 }}
            >
              Add Task
            </MenuButton>
            <Menu>
              {plugins?.map((row) => (
                <MenuItem
                  onClick={() => openModalForPLugin(row.uniqueId)}
                  key={row.uniqueId}
                >
                  {row.name}
                </MenuItem>
              ))}
            </Menu>
          </Dropdown>
        )}
        <Sheet
          variant="soft"
          color="primary"
          sx={{
            overflow: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          <EvalTasksTable
            experimentInfo={experimentInfo}
            experimentInfoMutate={experimentInfoMutate}
          />
        </Sheet>
        <Sheet
          sx={{
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: 2,
            pt: 2,
          }}
        >
          <EvalJobsTable />
        </Sheet>
      </Sheet>
    </>
  );
}
