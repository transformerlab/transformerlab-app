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
import React, { useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function TemplatedPromptModal({ open, setOpen, mutate }) {
  return (
    <Modal open={open}>
      <ModalDialog sx={{ minWidth: '500px' }}>
        <DialogTitle>Create New Prompt</DialogTitle>
        <ModalClose
          onClick={() => {
            setOpen(false);
          }}
        />
        {/* <DialogContent>Fill in the information of the project.</DialogContent> */}
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            const formData = new FormData(event.currentTarget);
            const promptName = formData.get('name') as string;
            const template = formData.get('template') as string;

            const response = await fetch(chatAPI.Endpoints.Prompts.New(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: promptName,
                text: template,
              }),
            });

            const responseJSON = await response.json();

            if (responseJSON?.status == 'error') {
              alert(responseJSON?.message);
              return;
            }

            mutate();

            setOpen(false);
          }}
        >
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input
                name="name"
                autoFocus
                required
                placeholder="My New Prompt"
              />
            </FormControl>
            <FormControl>
              <FormLabel>Template</FormLabel>
              <Textarea
                name="template"
                required
                minRows={4}
                placeholder="Summarize the following sentence:
{text}
Answer:
"
              />
              <FormHelperText>
                Use &#123;text&#125; as a placeholder for the place where the
                provided text will be inserted
              </FormHelperText>
            </FormControl>
            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
