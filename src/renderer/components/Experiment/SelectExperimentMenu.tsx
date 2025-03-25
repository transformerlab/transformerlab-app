import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import {
  CheckIcon,
  ChevronDownIcon,
  CogIcon,
  EllipsisVerticalIcon,
  PlusCircleIcon,
  SettingsIcon,
  StopCircleIcon,
  UserPlusIcon,
  XSquareIcon,
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
  Sheet,
} from '@mui/joy';
import { useState, useEffect, MouseEvent, FormEvent } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

function ExperimentSettingsMenu({ experimentInfo, setExperimentId }) {
  return (
    <Dropdown>
      <MenuButton variant="plain" sx={{ background: 'transparent !important' }}>
        <SettingsIcon size="20px" color="var(--joy-palette-text-tertiary)" />
      </MenuButton>
      <Menu variant="soft" className="select-experiment-menu">
        <MenuItem
          variant="soft"
          color="danger"
          onClick={() => {
            if (
              confirm(
                'Are you sure you want to delete this project? If you click on "OK" There is no way to recover it.',
              )
            ) {
              fetch(chatAPI.DELETE_EXPERIMENT_URL(experimentInfo?.id));
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
    mutate();
  }, [experimentInfo]);

  const createHandleClose = (id: string) => () => {
    setAnchorEl(null);
    setExperimentId(id);
  };

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
                  backgroundColor: 'transparent !important',
                  color: 'var(--joy-palette-neutral-plainColor)',
                  paddingLeft: 1,
                  paddingRight: 0,
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
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
              // const formJson = Object.fromEntries((formData as any).entries());
              // alert(JSON.stringify(formJson));
              const name = form.get('name');
              const response = await fetch(chatAPI.CREATE_EXPERIMENT_URL(name));
              const newId = await response.json();
              setExperimentId(newId);
              createHandleClose(newId);
              mutate();
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
