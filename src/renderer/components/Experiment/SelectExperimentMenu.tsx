import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import {
  CheckIcon,
  ChevronDownIcon,
  FlaskConicalIcon,
  LayoutGridIcon,
  PlusCircleIcon,
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
import { useNavigate, useLocation } from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { getAPIFullPath, fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import ExperimentsManagerModal from './ExperimentsManagerModal';

interface ExperimentMenuItem {
  id: string;
  name: string;
}

export default function SelectExperimentMenu({ models }) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [isManagerOpen, setIsManagerOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { team } = useAuth();

  // This gets all the available experiments
  const { data, isLoading, mutate } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.Recent(),
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

  const DEV_MODE = experimentInfo?.name === 'dev';
  const experimentItems: ExperimentMenuItem[] = Array.isArray(data)
    ? data.filter(
        (experiment): experiment is ExperimentMenuItem =>
          typeof experiment?.id === 'string' &&
          typeof experiment?.name === 'string',
      )
    : [];

  useEffect(() => {
    mutate();
  }, [experimentInfo]);

  const createHandleClose = (experimentId: string | number) => async () => {
    setExperimentId(String(experimentId));
    try {
      await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.Touch(String(experimentId)),
        { method: 'POST' },
      );
      mutate();
    } catch {
      // non-critical, don't block the switch
    }
    // If currently on an experiment page, update the URL to reflect the new experiment
    const match = location.pathname.match(/^\/experiment\/[^/]+\/(.+)$/);
    if (match) {
      navigate(
        `/experiment/${encodeURIComponent(String(experimentId))}/${match[1]}`,
      );
    }
  };

  const createNewExperiment = useCallback(
    async (name: string, fromRecipeId = null) => {
      // Prevent creation if experiments list is still loading or unavailable
      // Allow creation if data is an empty array (no experiments yet)
      if (isLoading || data === null || data === undefined) {
        alert('Please wait for experiments to load before creating a new one.');
        return false;
      }

      let newId = 0;

      if (fromRecipeId === null) {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Experiment.Create(name),
        );
        if (!response.ok) {
          const errorText = await response.text();
          alert(errorText || 'Failed to create experiment.');
          return false;
        }
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
          return false;
        }
        newId = responseJson?.data?.experiment_id;
      }

      // Recent dropdown only shows a few experiments; membership there is not a valid
      // "exists" check. Confirm the experiment is readable, then refresh the menu.
      const existsRes = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.Get(String(newId)),
      );
      if (!existsRes.ok) {
        alert(
          'Experiment created, but it could not be loaded. Please refresh and try again.',
        );
        return false;
      }

      await mutate();
      setExperimentId(String(newId));
      void createHandleClose(String(newId))();

      // Navigate to Notes page if experiment was created from a recipe AND recipe is not blank
      if (fromRecipeId !== null && fromRecipeId !== -1) {
        navigate(`/experiment/${encodeURIComponent(name)}/notes`);
      }
      return true;
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
                  <span
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      marginRight: '6px',
                    }}
                  >
                    <FlaskConicalIcon
                      strokeWidth={1.5}
                      style={{ width: '16px', height: '16px' }}
                    />
                  </span>
                  {experimentInfo?.name || 'Select'}
                  <span
                    style={{
                      flexGrow: 0,
                      justifyContent: 'right',
                      display: 'inline-flex',
                      marginLeft: '4px',
                    }}
                  >
                    <ChevronDownIcon
                      style={{ width: '16px', height: '16px' }}
                    />
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
            <MenuButton
              variant="plain"
              size="sm"
              sx={{
                fontSize: '20px',
                backgroundColor: 'transparent !important',
                color: 'var(--joy-palette-neutral-plainColor)',
                paddingLeft: 1,
                paddingRight: 0,
                marginRight: 0,
                marginBottom: '4px',
                minHeight: '22px',
                height: '22px',
                width: '100%',
                overflow: 'hidden',
                justifyContent: 'flex-start',
                gap: '6px',
              }}
            >
              <FlaskConicalIcon
                strokeWidth={1.5}
                style={{ flexShrink: 0, width: '16px', height: '16px' }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
                title={experimentInfo?.name || undefined}
              >
                {experimentInfo?.name || 'Select'}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  color: 'var(--joy-palette-neutral-plainColor)',
                  marginLeft: '4px',
                }}
              >
                <ChevronDownIcon style={{ width: '16px', height: '16px' }} />
              </span>
            </MenuButton>
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
              {isLoading && <MenuItem>Loading…</MenuItem>}
              {experimentItems.map((experiment) => {
                return (
                  <MenuItem
                    selected={experimentInfo?.id === experiment.id}
                    variant={
                      experimentInfo?.id === experiment.id ? 'soft' : undefined
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
                    <ListItemDecorator>
                      <FlaskConicalIcon strokeWidth={1} />
                    </ListItemDecorator>
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
            <MenuItem onClick={() => setIsManagerOpen(true)}>
              <ListItemDecorator>
                <LayoutGridIcon strokeWidth={1} />
              </ListItemDecorator>
              Manage experiments
            </MenuItem>
            <MenuItem onClick={() => setModalOpen(true)} disabled={isLoading}>
              <ListItemDecorator>
                <PlusCircleIcon strokeWidth={1} />
              </ListItemDecorator>
              New
            </MenuItem>
          </Menu>
        </Dropdown>
      </FormControl>
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
                if (experimentItems.some((exp) => exp.name === name)) {
                  alert('Experiment name already exists.');
                  return;
                }
                const created = await createNewExperiment(name);
                if (created) {
                  setModalOpen(false);
                }
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
      <ExperimentsManagerModal
        open={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        onExperimentSelect={(experimentId: string) => {
          createHandleClose(experimentId)();
          setIsManagerOpen(false);
        }}
        onNewExperiment={() => {
          setIsManagerOpen(false);
          setModalOpen(true);
        }}
        mutateRecent={mutate}
      />
    </div>
  );
}
