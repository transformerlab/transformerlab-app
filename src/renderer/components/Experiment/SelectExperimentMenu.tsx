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
  ListItemDecorator,
  Divider,
  Dropdown,
  MenuButton,
  Tooltip,
} from '@mui/joy';
import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import Recipes from '../Recipes';

const fetcher = (url) => fetch(url).then((res) => res.json());

function ExperimentSettingsMenu({ experimentInfo, setExperimentId, mutate }) {
  const noExperiment = !experimentInfo || !experimentInfo.id;
  return (
    <Dropdown>
      <MenuButton
        variant="plain"
        size="sm"
        disabled={noExperiment}
        sx={{ background: 'transparent !important', padding: 0 }}
      >
        <SettingsIcon
          size="20px"
          color={
            noExperiment
              ? 'var(--joy-palette-neutral-outlinedDisabledBorder)'
              : 'var(--joy-palette-text-tertiary)'
          }
        />
      </MenuButton>
      <Menu variant="soft" className="select-experiment-menu">
        <MenuItem
          variant="soft"
          color="danger"
          onClick={async () => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              await fetch(chatAPI.DELETE_EXPERIMENT_URL(experimentInfo?.id));
              mutate();
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

  // This gets all the available experiments
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.GET_EXPERIMENTS_URL(),
    fetcher,
  );

  useEffect(() => {
    if (data && data.length === 0) {
      setModalOpen(true);
    }
  }, [data]);

  useEffect(() => {
    if (data && data.length === 1) {
      setExperimentId(data[0].id);
    }
  }, [data]);

  const createHandleClose = (id: string) => () => {
    setAnchorEl(null);
    setExperimentId(id);
  };

  const noExperiments = data && data.length === 0; // This means the user has No Experiments

  const createNewExperiment = useCallback(async (name) => {
    const response = await fetch(chatAPI.CREATE_EXPERIMENT_URL(name));
    const newId = await response.json();
    mutate();
    setExperimentId(newId);
    setModalOpen(false);
  }, []);

  return (
    <div>
      <FormControl>
        <FormLabel
          sx={{
            paddingLeft: 1,
            color: 'var(--joy-palette-neutral-plainColor)',
            paddingBottom: 0,
            marginBottom: 0,
          }}
        >
          Experiment:
        </FormLabel>
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
              <Button
                variant="plain"
                sx={{
                  backgroundColor: 'transparent !important',
                  fontSize: '22px',
                  color: 'var(--joy-palette-neutral-plainDisabledColor)',
                  paddingLeft: 1,
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
            </Tooltip>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <MenuButton
                variant="plain"
                sx={{
                  fontSize: '22px',
                  maxWidth: '200px',
                  backgroundColor: 'transparent !important',
                  color: 'var(--joy-palette-neutral-plainColor)',
                  paddingLeft: 1,
                  paddingRight: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  justifyContent: 'left',
                  display: 'inline-flex',
                }}
              >
                <span
                  style={{
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {experimentInfo?.name || 'Select'}
                </span>
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
                mutate={mutate}
              />
            </div>
          )}
          <Menu className="select-experiment-menu">
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
                <PlusCircleIcon />
              </ListItemDecorator>
              New
            </MenuItem>
          </Menu>
        </Dropdown>
      </FormControl>
      <Recipes
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        createNewExperiment={createNewExperiment}
      />
    </div>
  );
}
