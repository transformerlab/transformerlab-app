import { Button, IconButton, Stack, Table } from '@mui/joy';
import { FileTextIcon, PlayIcon, Trash2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

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

export default function EvalTasksTable({
  experimentInfo,
  experimentInfoMutate,
}) {
  return (
    <>
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
    </>
  );
}
