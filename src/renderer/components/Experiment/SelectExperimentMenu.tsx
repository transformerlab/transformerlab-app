import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import {
  CheckIcon,
  ChevronDownIcon,
  PlusCircleIcon,
  StopCircleIcon,
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
} from '@mui/joy';
import { useState, useEffect, MouseEvent, FormEvent } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

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
                    flexGrow: 1,
                    justifyContent: 'right',
                    display: 'inline-flex',
                  }}
                >
                  <ChevronDownIcon />
                </span>
              </Button>
            </Tooltip>
          ) : (
            <MenuButton
              variant="plain"
              sx={{
                fontSize: '22px',
                backgroundColor: 'transparent !important',
                color: 'var(--joy-palette-neutral-plainColor)',
                paddingLeft: 1,
              }}
            >
              {experimentInfo?.name || 'Select'}
              <span
                style={{
                  flexGrow: 1,
                  justifyContent: 'right',
                  display: 'inline-flex',
                  color: 'var(--joy-palette-neutral-plainColor)',
                }}
              >
                <ChevronDownIcon />
              </span>
            </MenuButton>
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
