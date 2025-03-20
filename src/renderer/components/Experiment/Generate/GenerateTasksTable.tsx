import { Button, ButtonGroup, IconButton, Stack, Table } from '@mui/joy';
import { FileTextIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useState } from 'react';
import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

function listGenerations(generationString) {
  let result = [];
  if (generationString) {
    result = JSON.parse(generationString);
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
  const generation_model = script_parameters.generation_model
    ? script_parameters.generation_model
    : 'N/A';

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

async function generationRun(taskId: string) {
  await fetch(chatAPI.Endpoints.Tasks.Queue(taskId));
}

export default function GenerateTasksTable({
  experimentInfo,
  experimentInfoMutate,
  setCurrentPlugin,
  setCurrentGenerationId,
  setOpen,
}) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Tasks.ListByType('GENERATE'),
    fetcher,
  );
  console.log(data);
  return (
    <>
      <Table aria-label="basic table" stickyHeader sx={{}}>
        <thead>
          <tr>
            <th width="200px" style={{ paddingLeft: '1rem' }}>
              Name
            </th>
            <th>Details</th>
            <th>Plugin</th>
            <th style={{ textAlign: 'right' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {data &&
            data?.map((generations) => (
              <tr key={generations.id}>
                <td style={{ overflow: 'hidden', paddingLeft: '1rem' }}>
                  {generations.name}
                </td>
                <td style={{ overflow: 'hidden' }}>
                  {/* formatTemplateConfig(generations.script_parameters) */}
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
                      onClick={async () => await generationRun(generations.id)}
                    >
                      Queue
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setOpen(true);
                        setCurrentPlugin(generations?.plugin);
                        setCurrentGenerationId(generations.id);
                      }}
                    >
                      Edit
                    </Button>
                    <IconButton
                      onClick={async () => {
                        await fetch(
                          chatAPI.Endpoints.Tasks.DeleteTask(generations.id),
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
