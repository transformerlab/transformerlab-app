import { Button, ButtonGroup, IconButton, Stack, Table } from '@mui/joy';
import { FileTextIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useState } from 'react';
import useSWR from 'swr';

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
  const main_task = script_parameters.generation_type;
  let docs_file_name_actual = '';
  // Only keep the first 3 words of the main task

  // Set docs_file_name as script parameters docs or N/A depending upon main task and if it has the words 'docs'  in it
  const docs_file_name =
    main_task && main_task.toLowerCase().includes('docs')
      ? script_parameters.docs || 'N/A'
      : 'N/A';
  const is_docs = docs_file_name !== 'N/A';
  if (is_docs) {
    docs_file_name_actual = script_parameters.docs.split('/').pop();
  }
  const generation_model = script_parameters.generation_model? script_parameters.generation_model : 'N/A';

  return (
    <>
      <b>Type:</b> {main_task} <br />
      <b>Model:</b> {generation_model} <br />
      {is_docs && (
        <>
          <b>Docs:</b> {docs_file_name_actual} <FileTextIcon size={14} />
          <br />
        </>
      )}
    </>
  );
}

async function evaluationRun(
  experimentId: string,
  plugin: string,
  evaluator: string
) {
  // fetch(
  //   chatAPI.Endpoints.Experiment.RunGeneration(experimentId, plugin, evaluator)
  // );
  await fetch(
    chatAPI.Endpoints.Jobs.Create(
      experimentId,
      'GENERATE',
      'QUEUED',
      JSON.stringify({
        plugin: plugin,
        generator: evaluator,
      })
    )
  );
}


export default function GenerateTasksTable({
  experimentInfo,
  experimentInfoMutate,
  setCurrentPlugin,
  setCurrentEvalName,
  setOpen,
}) {

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
          {listEvals(experimentInfo?.config?.generations) &&
            listEvals(experimentInfo?.config?.generations)?.map(
              (generations) => (
                <tr key={generations.name}>
                  <td style={{ overflow: 'hidden', paddingLeft: '1rem' }}>
                    {generations.name}
                  </td>
                  <td style={{ overflow: 'hidden' }}>
                    {formatTemplateConfig(generations.script_parameters)}
                    {/* {evaluations?.script_parameters?.task}&nbsp; */}
                    {/* <FileTextIcon size={14} /> */}
                  </td>
                  <td>{generations.plugin}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ButtonGroup
                      variant="soft"
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <Button
                        startDecorator={<PlayIcon />}
                        variant="soft"
                        color="success"
                        onClick={async () =>
                          await evaluationRun(
                            experimentInfo.id,
                            generations.plugin,
                            generations.name
                          )
                        }
                      >
                        Queue
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setOpen(true);
                          setCurrentPlugin(generations?.plugin);
                          setCurrentEvalName(generations.name);
                        }}
                      >
                        Edit
                      </Button>
                      <IconButton
                        onClick={async () => {
                          await fetch(
                            chatAPI.Endpoints.Experiment.DeleteGeneration(
                              experimentInfo.id,
                              generations.name
                            )
                          );
                          experimentInfoMutate();
                        }}
                      >
                        <Trash2Icon />
                      </IconButton>
                    </ButtonGroup>
                  </td>
                </tr>
              )
            )}
        </tbody>
      </Table>
    </>
  );
}
