/* eslint-disable jsx-a11y/anchor-is-valid */
import { useRef, useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';

import {
  Button,
  Link,
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
  Select,
  Option,
  Box,
  FormHelperText,
  IconButton,
} from '@mui/joy';
import {
  FileTextIcon,
  PlayIcon,
  PlusCircleIcon,
  XSquareIcon,
} from 'lucide-react';
import DownloadButton from '../Train/DownloadButton';
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';
import ResultsModal from './ResultsModal';
const parseTmTheme = require('monaco-themes').parseTmTheme;

function listEvals(evalString) {
  let result = [];
  if (evalString) {
    result = JSON.parse(evalString);
  }
  return result;
}

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

function evaluationRun(experimentId: string, evaluator: string) {
  fetch(chatAPI.Endpoints.Experiment.RunEvaluation(experimentId, evaluator));
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);

  const [selectedPlugin, setSelectedPlugin] = useState('');

  const [currentEvaluator, setCurrentEvaluator] = useState('');

  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(chatAPI.Endpoints.Evals.List(), fetcher);

  const editorRef = useRef(null);

  async function handleEditorDidMount(editor, monaco) {
    if (editor) {
      editorRef.current = editor;
      const response = await fetch(
        chatAPI.Endpoints.Experiment.GetPlugin(
          experimentInfo.id,
          currentEvaluator
        )
      );
      const text = await response.json();
      editor.setValue(text);
    }
    setTheme(editor, monaco);
  }

  async function saveFile() {
    const value = editorRef?.current?.getValue();

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

  return (
    <>
      <Sheet>
        <ResultsModal
          open={resultsModalOpen}
          setOpen={setResultsModalOpen}
          experimentId={experimentInfo.id}
          evaluator={currentEvaluator}
        ></ResultsModal>
        <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
          <ModalDialog>
            <ModalClose onClick={() => setEditModalOpen(false)} />
            <DialogTitle>
              Edit Evaluator Script - {currentEvaluator}
            </DialogTitle>
            <DialogContent>
              <Sheet
                color="neutral"
                sx={{
                  p: 3,
                  backgroundColor: '#ddd',
                }}
              >
                <Editor
                  height="600px"
                  width="60vw"
                  defaultLanguage="python"
                  theme="my-theme"
                  options={{
                    minimap: {
                      enabled: false,
                    },
                    fontSize: 18,
                    cursorStyle: 'block',
                    wordWrap: 'on',
                  }}
                  onMount={handleEditorDidMount}
                />
              </Sheet>
            </DialogContent>
            <Box
              sx={{
                mt: 1,
                display: 'flex',
                gap: 1,
                flexDirection: { xs: 'column', sm: 'row-reverse' },
              }}
            >
              <Button sx={{ width: '120px' }}>Save</Button>
              <Button
                sx={{ width: '120px' }}
                color="danger"
                variant="soft"
                onClick={() => setEditModalOpen(false)}
              >
                Cancel
              </Button>
            </Box>
          </ModalDialog>
        </Modal>
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
                const plugin = event.target[1].value;
                const task = event.target[3].value;
                const localName = event.target[4].value;

                addEvaluation(plugin, localName, { task: task });
                setOpen(false);
              }}
            >
              {/* {JSON.stringify(plugins)} */}
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Evaluation Plugin Template:</FormLabel>
                  <Select
                    placeholder={
                      pluginsIsLoading
                        ? 'Loading...'
                        : 'Evaluation Plugin Template'
                    }
                    variant="soft"
                    size="lg"
                    name="evaluator_plugin"
                    value={selectedPlugin}
                    onChange={(e, newValue) => setSelectedPlugin(newValue)}
                    required
                  >
                    {plugins?.map((row) => (
                      <Option value={row.name} key={row.id}>
                        {row.name}
                      </Option>
                    ))}
                  </Select>{' '}
                </FormControl>
                <FormControl>
                  <FormLabel>Task:</FormLabel>
                  <Select
                    placeholder="select a field"
                    onChange={(e, newValue) => {
                      document.getElementsByName('evaluator_name')[0].value =
                        newValue;
                    }}
                  >
                    {getTemplateParametersForPlugin(selectedPlugin, plugins)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Short name:</FormLabel>
                  <Input
                    placeholder="Rouge Eval for Sample"
                    name="evaluator_name"
                    required
                  />
                  <FormHelperText>
                    A name to remember this evaluation by.
                  </FormHelperText>
                </FormControl>

                <Button type="submit">Submit</Button>
              </Stack>
            </form>
          </ModalDialog>
        </Modal>
        <Typography level="h1">Evaluate</Typography>
        <br />
        <Button
          startDecorator={<PlusCircleIcon />}
          onClick={() => setOpen(true)}
        >
          Add Evaluation
        </Button>
        <br />
        <br />
        <Table aria-label="basic table">
          <thead>
            <tr>
              <th>Evaluator</th>
              <th>&nbsp;</th>
              <th>Tasks</th>
              <th>Template</th>
              <th>Number of Records</th>
              <th style={{ textAlign: 'right' }}>&nbsp;</th>
              <th style={{ textAlign: 'right' }}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {listEvals(experimentInfo?.config?.evaluations) &&
              listEvals(experimentInfo?.config?.evaluations)?.map(
                (evaluations) => (
                  <tr key={evaluations.name}>
                    <td>{evaluations.name}</td>
                    <td>
                      <Button
                        variant="soft"
                        onClick={() => {
                          setCurrentEvaluator(evaluations.name);
                          setEditModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                    <td>
                      {evaluations?.script_parameters?.task}&nbsp;
                      <FileTextIcon size={14} />
                    </td>
                    <td>{evaluations.plugin}</td>
                    <td>30,252</td>
                    <td style={{ textAlign: 'right' }}>
                      {' '}
                      <Button
                        startDecorator={<PlayIcon />}
                        variant="soft"
                        onClick={() =>
                          evaluationRun(experimentInfo.id, evaluations.name)
                        }
                      >
                        Evaluate
                      </Button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Stack direction="row">
                        <Button
                          variant="plain"
                          onClick={() => {
                            setCurrentEvaluator(evaluations.name);
                            setResultsModalOpen(true);
                          }}
                        >
                          View Results
                        </Button>
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
                          <XSquareIcon />
                        </IconButton>
                      </Stack>
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </Table>
      </Sheet>
    </>
  );
}
