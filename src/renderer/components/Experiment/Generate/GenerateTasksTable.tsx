import { ReactElement, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Dropdown,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Sheet,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import { FileTextIcon, PlusCircleIcon, Trash2Icon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import GenerateModal from './GenerateModal';
import GenerateRunButton from './GenerateRunButton';

const fetcher = (url) => fetch(url).then((res) => res.json());

function listGenerations(generationString) {
  let result = [];
  if (generationString) {
    result = JSON.parse(generationString);
  }
  return result;
}

function formatTemplateConfig(scriptParameters): ReactElement {
  const mainTask = scriptParameters?.generation_type;
  let docsFileNameActual = '';

  const docsFileName =
    mainTask && mainTask.toLowerCase().includes('docs')
      ? scriptParameters.docs || 'N/A'
      : 'N/A';
  const isDocs = docsFileName !== 'N/A';
  if (isDocs) {
    docsFileNameActual = scriptParameters.docs.split('/').pop();
  }

  const rawModel = scriptParameters?.generation_model;
  const useFallback = !rawModel || rawModel === 'N/A' || rawModel === 'local';

  const generationModel = useFallback
    ? scriptParameters.model_name || 'N/A'
    : rawModel;

  return (
    <>
      <b>Type:</b> {mainTask} <br />
      <b>Model:</b> {generationModel} <br />
      {isDocs && (
        <>
          <b>Docs:</b> {docsFileNameActual} <FileTextIcon size={14} />
          <br />
        </>
      )}
    </>
  );
}

export default function GenerateTasksTable({
  experimentInfo,
  experimentInfoMutate,
  currentPlugin,
  setCurrentPlugin,
  currentGenerationId,
  setCurrentGenerationId,
}) {
  const [open, setOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Tasks.ListByTypeInExperiment(
      'GENERATE',
      experimentInfo.id,
    ),
    fetcher,
  );

  const {
    data: plugins,
    error: pluginsError,
    isLoading: pluginsIsLoading,
  } = useSWR(
    experimentInfo?.id &&
      chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentInfo?.id,
        'generator',
      ),
    fetcher,
  );

  // Fetch available machines for remote execution
  const { data: machinesData } = useAPI('network', ['machines']);
  const machines = machinesData?.data || [];

  function openModalForPLugin(pluginId) {
    setCurrentPlugin(pluginId);
    setOpen(true);
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={2}
        mb={2}
        justifyContent="space-between"
        alignItems="flex-end"
      >
        <Typography level="h3" mb={1}>
          Generation Tasks
        </Typography>
        {plugins?.length === 0 ? (
          <Alert color="danger">
            No Generator Scripts available, please install a generator plugin.
          </Alert>
        ) : (
          <Dropdown>
            <MenuButton
              startDecorator={<PlusCircleIcon />}
              variant="plain"
              color="success"
              sx={{ width: 'fit-content', mb: 1 }}
              size="sm"
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
      </Stack>

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
        <GenerateModal
          open={open}
          onClose={() => {
            setOpen(false);
            setCurrentGenerationId('');
          }}
          experimentInfo={experimentInfo}
          experimentInfoMutate={mutate}
          pluginId={currentPlugin}
          currentGenerationId={currentGenerationId}
        />
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
                    {formatTemplateConfig(JSON.parse(generations.config))}
                  </td>
                  <td>{generations.plugin}</td>
                  <td style={{ textAlign: 'right' }}>
                    <ButtonGroup
                      variant="soft"
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <GenerateRunButton
                        generationId={generations.id}
                        pluginName={generations.plugin}
                        experimentId={experimentInfo?.id}
                        machines={machines}
                        onTaskQueued={mutate}
                      />
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
                          mutate();
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
      </Sheet>
    </>
  );
}
