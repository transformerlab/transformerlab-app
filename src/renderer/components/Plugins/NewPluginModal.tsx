import React, { useState } from 'react';

import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

export default function NewPluginModal({
  open,
  setOpen,
  mutate,
  experimentInfo,
}) {
  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="h3">New Script</Typography>
          <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <form
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
              onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                const formData = new FormData(event.currentTarget);
                const name = formData.get('plugin-name');

                await fetch(
                  chatAPI.Endpoints.Experiment.ScriptCreateNew(
                    experimentInfo?.id,
                    name
                  )
                );
                mutate();
                setOpen(false);
              }}
            >
              <Input placeholder="Plugin Name" name="plugin-name" />
              <Button type="submit">Create</Button>
            </form>
          </Sheet>
        </ModalDialog>
      </Modal>
    </>
  );
}
