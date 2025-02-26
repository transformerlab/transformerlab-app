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

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function NewNodeModal({ open, onClose, workflowId }) {
  const [state, setState] = useState(null);

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Create new Node</DialogTitle>
        <DialogContent>Fill in the information.</DialogContent>
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const node = formData.get('node') as string;
            //const nodes = formData.get('nodes') as string;
            await fetch(
              chatAPI.Endpoints.Workflows.AddNode(
                workflowId,
                node
              )
            );
            onClose();
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Nodes</FormLabel>
              <Textarea minRows={4} autoFocus required name="node" />
            </FormControl>
            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
