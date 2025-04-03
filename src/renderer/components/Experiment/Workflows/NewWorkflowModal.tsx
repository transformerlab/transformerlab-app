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

export default function NewWorkflowModal({
  open,
  onClose,
  selectedWorkflow,
  experimentId,
}) {
  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        {selectedWorkflow?.id ? (
          <DialogTitle>Edit Workflow ID: {selectedWorkflow?.id}</DialogTitle>
        ) : (
          <DialogTitle>New Workflow</DialogTitle>
        )}
        {/* {JSON.stringify(selectedWorkflow)} */}
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
            <input
              type="hidden"
              name="workflowId"
              value={selectedWorkflow?.id}
            />
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input
                autoFocus
                required
                name="name"
                defaultValue={selectedWorkflow?.name}
              />
            </FormControl>
            {/* <FormControl>
              <FormLabel>Nodes</FormLabel>
              <Textarea minRows={4} name="nodes" />
              <FormHelperText>
                Leave Blank to Create an Empty Workflow
              </FormHelperText>
            </FormControl> */}
            <Button type="submit">Save</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
