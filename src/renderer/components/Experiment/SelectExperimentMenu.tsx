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
  Stack,
  Typography,
  Divider,
  Dropdown,
  MenuButton,
  Tooltip,
} from '@mui/joy';
import { useState, useEffect, FormEvent, useCallback } from 'react';
import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipesModal from './Recipes';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

function ExperimentSettingsMenu({ experimentInfo, setExperimentId }) {
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
              fetch(
                `${chatAPI.API_URL()}experiment/${experimentInfo.id}/export_to_recipe`,
              ).then(() => {
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
          onClick={() => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              fetch(chatAPI.Endpoints.Experiment.Delete(experimentInfo?.id));
              setExperimentId(null);
            }
          }}
        >
          Delete {experimentInfo?.name}
        </MenuItem>
      </Menu>
    </Dropdown>
  );
}

export default function SelectExperimentMenu({
  experimentInfo,
  setExperimentId,
  models,
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const navigate = useNavigate();

  // This gets all the available experiments
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.GetAll(),
    fetcher,
  );

  const DEV_MODE = experimentInfo?.name === 'dev';

  useEffect(() => {
    mutate();
  }, [experimentInfo]);

  const createHandleClose = (id: string) => () => {
    setAnchorEl(null);
    setExperimentId(id);
  };

  const createNewExperiment = useCallback(
    async (name: string, fromRecipeId = null) => {
      let newId = 0;

      if (fromRecipeId === null) {
        const response = await fetch(chatAPI.Endpoints.Experiment.Create(name));
        newId = await response.json();
      } else {
        const response = await fetch(
          getFullPath('recipes', ['createExperiment'], {
            id: fromRecipeId,
            experiment_name: name,
          }),
          {
            method: 'POST',
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
      setExperimentId(newId);
      createHandleClose(newId);
      mutate();

      // Navigate to Notes page if experiment was created from a recipe AND recipe is not blank
      if (fromRecipeId !== null && fromRecipeId !== -1) {
        navigate('/experiment/notes');
      }
    },
    [setExperimentId, mutate, navigate],
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
                    color: 'var(--joy-palette-neutral-plainDisabledColor)',
                    paddingLeft: 1,
                    paddingRight: 0,
                    minHeight: '22px',
                    height: '22px',
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
                  textWrapMode: 'nowrap',
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
              />
            </div>
          )}
          <Menu
            className="select-experiment-menu"
            variant="plain"
            sx={{
              width: 170,
              overflowX: 'hidden',
              overflowY: 'auto',
              maxHeight: '80dvh',
              // make scrollbar thin:
              scrollbarWidth: 'thin',
              scrollbarColor:
                'var(--joy-palette-neutral-plainColor) transparent',
            }}
          >
            {data &&
              data.map((experiment: any) => {
                return (
                  <MenuItem
                    selected={experimentInfo?.name === experiment.name}
                    variant={
                      experimentInfo?.name === experiment.name
                        ? 'soft'
                        : undefined
                    }
                    onClick={createHandleClose(experiment.id)}
                    key={experiment.id}
                    sx={{ display: 'flex', width: '170px' }}
                  >
                    {experiment.name}

                    {/* <Typography level="body2" textColor="neutral.300" ml="auto">
                      <XSquareIcon size="20px" onClick={() => alert('del')} />
                    </Typography> */}
                    {experimentInfo?.name === experiment.name && (
                      <CheckIcon style={{ marginLeft: 'auto' }} />
                    )}
                  </MenuItem>
                );
              })}
            <Divider />
            <MenuItem onClick={() => setModalOpen(true)}>
              <ListItemDecorator>
                <PlusCircleIcon strokeWidth={1} />
              </ListItemDecorator>
              New
            </MenuItem>
          </Menu>
        </Dropdown>
      </FormControl>
      <RecipesModal
        modalOpen={modalOpen && DEV_MODE}
        setModalOpen={setModalOpen}
        createNewExperiment={createNewExperiment}
      />
      <Modal open={modalOpen && !DEV_MODE} onClose={() => setModalOpen(false)}>
        <ModalDialog
          aria-labelledby="basic-modal-dialog-title"
          aria-describedby="basic-modal-dialog-description"
          sx={{ maxWidth: 500 }}
        >
          <Typography id="basic-modal-dialog-title" component="h2">
            Create new experiment
          </Typography>
          {/* <Typography
            id="basic-modal-dialog-description"
            textColor="text.tertiary"
          >
            Please supply a friendly name for your project
          </Typography> */}
          <form
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.target);
              createNewExperiment(form.get('name') as string);
              setModalOpen(false);
            }}
          >
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Experiment Name</FormLabel>
                <Input name="name" autoFocus required />
              </FormControl>
              {/* <FormControl>
                <FormLabel>Description</FormLabel>
                <Input required />
              </FormControl> */}
              <Button type="submit">Submit</Button>
              <Button variant="soft" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </div>
  );
}
