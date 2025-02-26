import {
  Button,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Textarea,
} from '@mui/joy';
import { useState } from 'react';

export default function NewWorkflowModal({ open, setOpen }) {
  const [state, setState] = useState(null);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Create new workflow</DialogTitle>
        <DialogContent>Fill in the information.</DialogContent>
        <form
          onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input autoFocus required />
            </FormControl>
            <FormControl>
              <FormLabel>Nodes</FormLabel>
              <Textarea minRows={4} />
              <FormHelperText>
                Leave Blank to Create an Empty Workflow
              </FormHelperText>
            </FormControl>
            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
