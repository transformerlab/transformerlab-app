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

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function NewWorkflowModal({ open, onClose, experimentId }) {
  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Create new workflow</DialogTitle>
        <DialogContent>Fill in the information.</DialogContent>
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const workflowName = formData.get('name') as string;
            await fetch(
              chatAPI.Endpoints.Workflows.CreateEmpty(
                workflowName,
                experimentId,
              ),
            );
            onClose();
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input autoFocus required name="name" />
            </FormControl>
            <FormControl>
              <FormLabel>Nodes</FormLabel>
              <Textarea minRows={4} name="nodes" />
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
