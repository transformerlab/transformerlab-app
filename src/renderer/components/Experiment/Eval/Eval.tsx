/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';

import {
  Button,
  Table,
  Typography,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Option,
  Box,
  IconButton,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
  Alert,
} from '@mui/joy';
import {
  FileTextIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
  XSquareIcon,
} from 'lucide-react';

import DynamicPluginForm from '../DynamicPluginForm';
import EvalJobsTable from './EvalJobsTable.tsx';
const parseTmTheme = require('monaco-themes').parseTmTheme;

function listEvals(evalString) {
  let result = [];
  if (evalString) {
    result = JSON.parse(evalString);
  }
  return result;
}

async function evaluationRun(
  experimentId: string,
  plugin: string,
  evaluator: string
) {
  // fetch(
  //   chatAPI.Endpoints.Experiment.RunEvaluation(experimentId, plugin, evaluator)
  // );
  await fetch(
    chatAPI.Endpoints.Jobs.Create(
      experimentId,
      'EVAL',
      'QUEUED',
      JSON.stringify({
        plugin: plugin,
        evaluator: evaluator,
      })
    )
  );
}

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
                const nameOfThisEvaluation =
                  selectedPlugin + '_' + JSON.stringify(formJson);
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
        <Typography level="h2" mb={1}>
          Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Evaluation Scripts available, please install an evaluator plugin.
          </Alert>
        ) : (
          <Dropdown>
            <MenuButton
              startDecorator={<PlusCircleIcon />}
              variant="soft"
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
          <Table aria-label="basic table" stickyHeader>
            <thead>
              <tr>
                <th>Evaluator</th>
                <th style={{ width: '80px' }}>&nbsp;</th>
                <th>Tasks</th>
                <th>Plugin</th>
                <th style={{ textAlign: 'right' }}>&nbsp;</th>
                <th style={{ textAlign: 'right' }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {listEvals(experimentInfo?.config?.evaluations) &&
                listEvals(experimentInfo?.config?.evaluations)?.map(
                  (evaluations) => (
                    <tr key={evaluations.name}>
                      <td style={{ overflow: 'hidden' }}>{evaluations.name}</td>
                      <td>
                        {/* <Button
                          variant="soft"
                          onClick={() => {
                            setSelectedPlugin(evaluations.plugin);
                            setCurrentEvaluator(evaluations.name);
                            setEditModalOpen(true);
                          }}
                        >
                          Edit
                        </Button> */}
                      </td>
                      <td style={{ overflow: 'hidden' }}>
                        {evaluations?.script_parameters?.task}&nbsp;
                        <FileTextIcon size={14} />
                      </td>
                      <td>{evaluations.plugin}</td>
                      <td style={{ textAlign: 'right' }}>
                        {' '}
                        <Button
                          startDecorator={<PlayIcon />}
                          variant="soft"
                          color="success"
                          onClick={async () =>
                            await evaluationRun(
                              experimentInfo.id,
                              evaluations.plugin,
                              evaluations.name
                            )
                          }
                        >
                          Queue
                        </Button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Stack direction="row">
                          <IconButton
                            onClick={async () => {
                              await fetch(
                                chatAPI.Endpoints.Experiment.DeleteEval(
                                  experimentInfo.id,
                                  evaluations.name
                                )
                              );
                              experimentInfoMutate();
                            }}
                          >
                            <Trash2Icon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  )
                )}
            </tbody>
          </Table>
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
