import React, { useState } from 'react';

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
import Alert from '@mui/joy/Alert';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function NewWorkflowModal({
  open,
  onClose,
  selectedWorkflow,
  experimentId,
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        {selectedWorkflow?.id ? (
          <DialogTitle>Edit Workflow ID: {selectedWorkflow?.id}</DialogTitle>
        ) : (
          <DialogTitle>New Workflow</DialogTitle>
        )}
        {error && (
          <Alert color="danger" variant="solid" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {/* {JSON.stringify(selectedWorkflow)} */}
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const workflowName = formData.get('name') as string;
            if (selectedWorkflow?.id) {
              // Update existing workflow
              const response = await fetch(
                chatAPI.Endpoints.Workflows.UpdateName(
                  selectedWorkflow.id,
                  workflowName,
                  experimentId,
                ),
              );
              let data;
              try {
                data = await response.json();
              } catch (e) {
                data = {};
              }
              if (data && data.error) {
                setError(data.error);
                return;
              }
              onClose();
            } else {
              const response = await fetch(
                chatAPI.Endpoints.Workflows.CreateEmpty(
                  workflowName,
                  experimentId,
                ),
              );
              let data;
              try {
                data = await response.json();
              } catch (e) {
                data = {};
              }
              if (data && data.error) {
                setError(data.error);
                return;
              }
              onClose();
            }
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
                onChange={() => setError(null)}
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
