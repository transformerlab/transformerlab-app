import { Button, ButtonGroup, IconButton, Stack, Table } from '@mui/joy';
import { FileTextIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import EvalModal from './EvalModal';
import { useState } from 'react';
import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

function listEvals(evalString) {
  let result = [];
  if (evalString) {
    result = JSON.parse(evalString);
  }
  return result;
}

function formatTemplateConfig(script_parameters): ReactElement {
  // const c = JSON.parse(script_parameters);

  // Remove the author/full path from the model name for cleanliness
  // const short_model_name = c.model_name.split('/').pop();
  // Set main_task as either or the metric name from the script parameters
  const main_task = (() => {
    let predefined_tasks = script_parameters.predefined_tasks
      ? script_parameters.predefined_tasks
      : '';
    if (script_parameters.tasks) {
      try {
        const tasksArray = JSON.parse(script_parameters.tasks);
        if (Array.isArray(tasksArray)) {
          return (
            tasksArray.map((task) => task.name).join(', ') + predefined_tasks
          );
        }
      } catch (error) {
        // Invalid JSON; fall back to the original value
      }
      return script_parameters.tasks + predefined_tasks;
    }
    return script_parameters.tasks + predefined_tasks;
  })();
  const dataset_name = script_parameters.dataset_name
    ? script_parameters.dataset_name
    : 'N/A';
  const judge_model = script_parameters.judge_model
    ? script_parameters.judge_model
    : 'N/A';
  const is_model = judge_model !== 'N/A';
  const is_dataset = dataset_name !== 'N/A';

  const r = (
    <>
      <b>Metrics/Tasks:</b> {main_task} <br />
      {is_dataset && (
        <>
          <b>Dataset:</b> {dataset_name} <FileTextIcon size={14} />
          <br />
        </>
      )}
      {is_model && (
        <>
          <b>Model:</b> {judge_model}
          <br />
        </>
      )}
    </>
  );
  return r;
}

async function evaluationRun(taskId: string) {
  // fetch(
  //   chatAPI.Endpoints.Experiment.RunEvaluation(experimentId, plugin, evaluator)
  // );
  await fetch(chatAPI.Endpoints.Tasks.Queue(taskId));
}

export default function EvalTasksTable({
  experimentInfo,
  experimentInfoMutate,
  setCurrentPlugin,
  setCurrentEvalId,
  setOpen,
}) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Tasks.ListByTypeInExperiment('EVAL', experimentInfo.id),
    fetcher,
  );

  return (
    <>
      <Table aria-label="basic table" stickyHeader sx={{}}>
        <thead>
          <tr>
            <th width="200px" style={{ paddingLeft: '1rem' }}>
              Name
            </th>
            <th>Tasks</th>
            <th>Plugin</th>
            <th style={{ textAlign: 'right' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {data &&
            data?.map((evaluations) => (
              <tr key={evaluations.id}>
                <td style={{ overflow: 'hidden', paddingLeft: '1rem' }}>
                  {evaluations.name}
                </td>
                <td style={{ overflow: 'hidden' }}>
                  {formatTemplateConfig(JSON.parse(evaluations.config))}
                  {/* {evaluations?.script_parameters?.task}&nbsp; */}
                  {/* <FileTextIcon size={14} /> */}
                </td>
                <td>{evaluations.plugin}</td>
                <td style={{ textAlign: 'right' }}>
                  <ButtonGroup
                    variant="soft"
                    sx={{ justifyContent: 'flex-end' }}
                  >
                    <Button
                      startDecorator={<PlayIcon />}
                      variant="soft"
                      color="success"
                      onClick={async () => await evaluationRun(evaluations.id)}
                    >
                      Queue
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setOpen(true);
                        setCurrentPlugin(evaluations?.plugin);
                        setCurrentEvalId(evaluations.id);
                      }}
                    >
                      Edit
                    </Button>
                    <IconButton
                      onClick={async () => {
                        await fetch(
                          chatAPI.Endpoints.Tasks.DeleteTask(evaluations.id),
                        );
                        experimentInfoMutate();
                      }}
                    >
                      <Trash2Icon />
                    </IconButton>
                  </ButtonGroup>
                </td>
              </tr>
            ))}
        </tbody>
      </Table>
    </>
  );
}
