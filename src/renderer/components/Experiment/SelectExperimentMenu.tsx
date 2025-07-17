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
  Box,
} from '@mui/joy';
import { useState, useEffect, FormEvent, useCallback } from 'react';
import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipesModal from './Recipes';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

const fetcher = (url) => fetch(url).then((res) => res.json());

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
          onClick={async () => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              await fetch(
                chatAPI.Endpoints.Experiment.Delete(experimentInfo?.id),
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const { experimentInfo, setExperimentId } = useExperimentInfo();

  // This gets all the available experiments
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.GetAll(),
    fetcher,
  );

  const DEV_MODE = experimentInfo?.name === 'dev';

  useEffect(() => {
    mutate();
  }, [experimentInfo]);

  const createHandleClose = (id: number) => () => {
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
          getAPIFullPath('recipes', ['createExperiment'], {
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
                      {experimentInfo?.name === experiment.name && (
                        <CheckIcon style={{ marginLeft: 'auto' }} />
                      )}
                    </MenuItem>
                  );
                })}
            </Box>
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
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        createNewExperiment={createNewExperiment}
        showRecentExperiments={false}
      />
    </div>
  );
}
