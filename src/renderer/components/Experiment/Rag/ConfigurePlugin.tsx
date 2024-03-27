import { FormEvent } from 'react';

import { Button, Modal, ModalDialog, Stack, Typography } from '@mui/joy';
import { ArrowRightFromLineIcon } from 'lucide-react';

import DynamicPluginForm from '../DynamicPluginForm';

const fetcher = (url) => fetch(url).then((res) => res.json());

/**
 * PluginSettingsModal
 * onClose is a function that gets executed anytime this modal gets closed (cancel or submit)
 * onSubmit is a function that gets executed only when this form is submitted
 */
export default function PluginSettingsModal({
  open,
  onClose,
  experimentInfo,
  plugin,
}) {
  const currentModelName = experimentInfo?.config?.foundation;

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
      }}
    >
      <ModalDialog
        sx={{
          width: '70vw',
          maxWidth: '600px',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          top: '10vh',
          overflow: 'auto',
          maxHeight: '80vh',
          minHeight: '70vh',
          height: '100%',
        }}
      >
        <Typography level="h3">Configure {plugin}</Typography>
        <form
          id="training-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form_data = new FormData(event.currentTarget);
            const form_json = Object.fromEntries((form_data as any).entries());

            // onSubmit(
            //   plugin.uniqueId,
            //   plugin.export_architecture,
            //   JSON.stringify(form_json)
            // );
            onClose();
          }}
        >
          <Stack spacing={2}>
            <DynamicPluginForm
              experimentInfo={experimentInfo}
              plugin={plugin}
            />
          </Stack>

          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button
              color="danger"
              variant="soft"
              onClick={() => {
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="soft"
              type="submit"
              startDecorator={<ArrowRightFromLineIcon />}
            >
              Save
            </Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
