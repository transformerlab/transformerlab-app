import * as React from 'react';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import Stack from '@mui/joy/Stack';
import { Divider, FormHelperText, ModalClose, Textarea } from '@mui/joy';
import MainGenerationConfigKnobs from './MainGenerationConfigKnobs';
import { RotateCcwIcon } from 'lucide-react';
import SystemMessageBox from './SystemMessageBox';

export default function BasicModalDialog({
  open,
  setOpen,
  defaultPromptConfigForModel,
  generationParameters,
  setGenerationParameters,
  tokenCount,
  experimentInfo,
  experimentInfoMutate,
}) {
  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog sx={{ minWidth: '70vh', overflow: 'auto' }}>
          <ModalClose />
          <DialogTitle>Prompt and Generation Settings</DialogTitle>
          <DialogContent></DialogContent>
          <form
            onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setOpen(false);
            }}
          >
            <Stack spacing={2} sx={{ marginTop: 3 }}>
              <MainGenerationConfigKnobs
                generationParameters={generationParameters}
                setGenerationParameters={setGenerationParameters}
                tokenCount={tokenCount}
                defaultPromptConfigForModel={defaultPromptConfigForModel}
              />
              <SystemMessageBox
                experimentInfo={experimentInfo}
                experimentInfoMutate={experimentInfoMutate}
                defaultPromptConfigForModel={defaultPromptConfigForModel}
                showResetButton
              />
              {/* {JSON.stringify(defaultPromptConfigForModel)} */}
              <FormControl sx={{ paddingTop: 3 }}>
                <FormLabel>Stop String</FormLabel>
                <Input
                  defaultValue={defaultPromptConfigForModel?.stop_str}
                  value={generationParameters?.stop_str}
                  onChange={() => {
                    setGenerationParameters({
                      ...generationParameters,
                      stop_str: event.target.value,
                    });
                  }}
                ></Input>
                <FormHelperText>
                  The model will stop generating text when it encounters this
                  string.
                </FormHelperText>
              </FormControl>
              <FormControl>
                <FormLabel>Template</FormLabel>
                <Textarea
                  minRows={5}
                  value={defaultPromptConfigForModel?.system_template}
                  disabled
                ></Textarea>
              </FormControl>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}
