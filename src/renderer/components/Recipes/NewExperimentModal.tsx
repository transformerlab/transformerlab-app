/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Typography,
} from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { FormEvent } from 'react';

export default function newExperimentModal({
  modalOpen,
  setModalOpen,
  createNewExperiment,
}) {
  return (
    <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
      <ModalDialog
        aria-labelledby="basic-modal-dialog-title"
        aria-describedby="basic-modal-dialog-description"
        sx={{ maxWidth: 500 }}
      >
        <Typography id="basic-modal-dialog-title" component="h2">
          Create new experiment
        </Typography>
        <form
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.target);
            const name = form.get('name');
            createNewExperiment(name as string);
            setModalOpen(false);
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Experiment Name</FormLabel>
              <Input name="name" autoFocus required />
            </FormControl>
            <Button type="submit">Submit</Button>
            <Button variant="soft" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
