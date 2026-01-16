import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import {
  CheckIcon,
  ChevronDownIcon,
  PlusCircleIcon,
  SettingsIcon,
  StopCircleIcon,
} from 'lucide-react';
import {
  FormControl,
  FormLabel,
  Input,
  ListItemDecorator,
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Divider,
  Dropdown,
  MenuButton,
  Tooltip,
  Box,
  Sheet,
} from '@mui/joy';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useSWRWithAuth as useSWR,
  useAuth,
  useAPI,
} from 'renderer/lib/authContext';
import { useNavigate } from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipesModal from './Recipes';
import {
  getAPIFullPath,
  fetcher,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

function ExperimentSettingsMenu({
  experimentInfo,
  setExperimentId,
  data,
  mutate,
}) {
  return (
    <Dropdown>
      <MenuButton
        variant="plain"
        size="sm"
        sx={{
          background: 'transparent !important,',
          padding: 0,
          paddingInline: 0,
          minHeight: '18px',
          height: '18px',
        }}
      >
        <SettingsIcon size="18px" color="var(--joy-palette-text-tertiary)" />
      </MenuButton>
      <Menu variant="soft" className="select-experiment-menu">
        <MenuItem
          variant="soft"
          onClick={() => {
            if (experimentInfo?.id) {
              chatAPI
                .authenticatedFetch(
                  `${chatAPI.API_URL()}experiment/${experimentInfo.id}/export_to_recipe`,
                )
                .then(() => {
                  alert(
                    `Your experiment was exported as a recipe to ~/.transformerlab/workspace/${experimentInfo.name}_export.json`,
                  );
                });
            }
          }}
          disabled={!experimentInfo?.config?.foundation}
        >
          Export {experimentInfo?.name}
        </MenuItem>
        <MenuItem
          variant="soft"
          color="danger"
          onClick={async () => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              await chatAPI.authenticatedFetch(
                chatAPI.Endpoints.Experiment.Delete(experimentInfo?.id),
                {},
              );

              // Find the next available experiment (first one in the list that's not the deleted one)
              const remainingExperiments =
                data?.filter((exp) => exp.id !== experimentInfo?.id) || [];

              if (remainingExperiments.length > 0) {
                // Set to the first experiment in the remaining list
                setExperimentId(remainingExperiments[0].id);
              } else {
                // Only set to null if no experiments remain
                setExperimentId(null);
              }

              // Refresh the experiments list
              mutate();
            }
          }}
        >
          Delete {experimentInfo?.name}
        </MenuItem>
      </Menu>
    </Dropdown>
  );
}

export default function SelectExperimentMenu({ models }) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [mode, setMode] = useState<string>('local');
  const navigate = useNavigate();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { team } = useAuth();

  // This gets all the available experiments
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.GetAll(),
    fetcher,
  );

  // Fetch providers
  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const hasProviders = providers.length > 0;
  const isLocalMode = mode === 'local';
  const shouldShowSimpleDialog = !isLocalMode;

  // Fetch healthz to get the mode
  useEffect(() => {
    const fetchHealthz = async () => {
      try {
        const data = await apiHealthz();
        if (data?.mode) {
          setMode(data.mode);
        }
      } catch (error) {
        console.error('Failed to fetch healthz data:', error);
      }
    };

    fetchHealthz();
  }, []);

  const DEV_MODE = experimentInfo?.name === 'dev';

  useEffect(() => {
    mutate();
  }, [experimentInfo]);

  const createHandleClose = (id: string) => () => {
    setExperimentId(id);
  };

  const createNewExperiment = useCallback(
    async (name: string, fromRecipeId = null) => {
      // Prevent creation if experiments list is still loading or unavailable
      // Allow creation if data is an empty array (no experiments yet)
      if (isLoading || data === null || data === undefined) {
        alert('Please wait for experiments to load before creating a new one.');
        return;
      }

      let newId = 0;

      if (fromRecipeId === null) {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Experiment.Create(name),
        );
        newId = await response.json();
      } else {
        const response = await chatAPI.authenticatedFetch(
          getAPIFullPath('recipes', ['createExperiment'], {
            id: fromRecipeId,
            experiment_name: name,
          }),
          {
            method: 'POST',
            headers: {},
          },
        );
        const responseJson = await response.json();
        if (!(responseJson?.status === 'success')) {
          alert(
            `Error creating experiment from recipe: ${responseJson?.message || 'Unknown error'}`,
          );
          return;
        }
        newId = responseJson?.data?.experiment_id;
      }

      // After creation, refresh the list and ensure the new experiment is in it before updating state
      await mutate();
      const updatedData = await mutate(); // Wait for mutate to complete and get fresh data
      const newExperimentExists = updatedData?.some(
        (exp: any) => exp.id === newId,
      );
      if (!newExperimentExists) {
        alert(
          'Experiment created, but failed to load in the list. Please refresh and try again.',
        );
        return;
      }

      setExperimentId(newId);
      createHandleClose(newId);

      // Navigate to Notes page if experiment was created from a recipe AND recipe is not blank
      if (fromRecipeId !== null && fromRecipeId !== -1) {
        navigate('/experiment/notes');
      }
    },
    [setExperimentId, mutate, navigate, isLoading, data],
  );

  return (
    <div>
      <FormControl>
        {/* <FormLabel
          sx={{
            paddingLeft: 1,
            color: 'var(--joy-palette-neutral-plainColor)',
            paddingBottom: 0,
            marginBottom: 0,
          }}
        >
          <Typography level="body-sm">Experiment:</Typography>
        </FormLabel> */}
        <Dropdown>
          {models?.length > 0 ? (
            <Tooltip
              title={
                <>
                  Experiment is locked while LLM is running.
                  <br />
                  Press stop <StopCircleIcon size="16px" /> first.
                </>
              }
              variant="soft"
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <Button
                  variant="plain"
                  sx={{
                    backgroundColor: 'transparent !important',
                    fontSize: '20px',
                    color: 'var(--joy-palette-neutralDisabledColor)',
                    paddingLeft: 1,
                    paddingRight: 0,
                    minHeight: '22px',
                    height: '22px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {experimentInfo?.name || 'Select'}
                  <span
                    style={{
                      flexGrow: 0,
                      justifyContent: 'right',
                      display: 'inline-flex',
                      marginLeft: '8px',
                    }}
                  >
                    <ChevronDownIcon size="18px" />
                  </span>
                  <span
                    style={{
                      flexGrow: 1,
                      justifyContent: 'right',
                      display: 'inline-flex',
                      color: 'var(--joy-palette-neutral-plainColor)',
                    }}
                  >
                    &nbsp;
                  </span>
                </Button>
              </div>
            </Tooltip>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <MenuButton
                variant="plain"
                size="sm"
                sx={{
                  fontSize: '20px',
                  backgroundColor: 'transparent !important',
                  color: 'var(--joy-palette-neutral-plainColor)',
                  paddingLeft: 1,
                  marginRight: 0.5,
                  minHeight: '22px',
                  height: '22px',
                  overflow: 'hidden',
                  justifyContent: 'flex-start',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {experimentInfo?.name || 'Select'}
                <span
                  style={{
                    flexGrow: 0,
                    justifyContent: 'right',
                    display: 'inline-flex',
                    color: 'var(--joy-palette-neutral-plainColor)',
                    marginLeft: '8px',
                  }}
                >
                  <ChevronDownIcon size="18px" />
                </span>
                <span
                  style={{
                    flexGrow: 1,
                    justifyContent: 'right',
                    display: 'inline-flex',
                    color: 'var(--joy-palette-neutral-plainColor)',
                  }}
                >
                  &nbsp;
                </span>
              </MenuButton>
              <ExperimentSettingsMenu
                experimentInfo={experimentInfo}
                setExperimentId={setExperimentId}
                data={data}
                mutate={mutate}
              />
            </div>
          )}
          <Menu
            className="select-experiment-menu"
            variant="soft"
            sx={{
              width: 270,
              overflowX: 'hidden',
              overflowY: 'hidden',
              maxHeight: '80dvh',
              // make scrollbar thin:
              scrollbarWidth: 'thin',
              scrollbarColor:
                'var(--joy-palette-neutral-plainColor) transparent',
            }}
            placement="bottom-start"
            color="neutral"
          >
            <Box
              sx={{
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarColor:
                  'var(--joy-palette-background-level3) transparent',
              }}
            >
              {isLoading && <MenuItem>Loading...</MenuItem>}
              {data &&
                data
                  .filter(
                    (experiment: any) => experiment?.id && experiment?.name,
                  ) // skip bad rows
                  .map((experiment: any) => {
                    return (
                      <MenuItem
                        selected={experimentInfo?.id === experiment.id}
                        variant={
                          experimentInfo?.id === experiment.id
                            ? 'soft'
                            : undefined
                        }
                        onClick={createHandleClose(experiment.id)}
                        key={experiment.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                          }}
                          title={experiment.name}
                        >
                          {experiment.name}
                        </span>
                        {experimentInfo?.id === experiment.id && (
                          <CheckIcon style={{ marginLeft: 'auto' }} />
                        )}
                      </MenuItem>
                    );
                  })}
            </Box>
            <Divider />
            <MenuItem onClick={() => setModalOpen(true)} disabled={isLoading}>
              <ListItemDecorator>
                <PlusCircleIcon strokeWidth={1} />
              </ListItemDecorator>
              New
            </MenuItem>
          </Menu>
        </Dropdown>
      </FormControl>
      {shouldShowSimpleDialog ? (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <ModalDialog>
            <ModalClose />
            <Typography level="title-lg">New Experiment</Typography>
            <Divider sx={{ my: 1 }} />
            <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  // Allow creation if data is an empty array (no experiments yet)
                  if (isLoading || data === null || data === undefined) {
                    alert(
                      'Please wait for experiments to load before creating a new one.',
                    );
                    return;
                  }
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('experiment-name') as string;
                  if (!name || name.trim() === '') {
                    alert('Experiment name is required.');
                    return;
                  }
                  // Check if experiment name already exists (fallback, as API also checks)
                  if (data?.some((exp: any) => exp.name === name)) {
                    alert('Experiment name already exists.');
                    return;
                  }
                  await createNewExperiment(name);
                  setModalOpen(false);
                }}
              >
                <Input
                  placeholder="Experiment Name"
                  name="experiment-name"
                  required
                  autoFocus
                />
                <Button type="submit">Create</Button>
              </form>
            </Sheet>
          </ModalDialog>
        </Modal>
      ) : (
        <RecipesModal
          modalOpen={modalOpen}
          setModalOpen={setModalOpen}
          createNewExperiment={createNewExperiment}
          showRecentExperiments={false}
        />
      )}
    </div>
  );
}
