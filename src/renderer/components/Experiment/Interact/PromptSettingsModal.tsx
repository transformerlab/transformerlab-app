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
import {
  Box,
  Chip,
  ChipDelete,
  Divider,
  FormHelperText,
  ModalClose,
  Textarea,
} from '@mui/joy';
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
  const [stopStrings, setStopStrings] = React.useState<string[] | null>(null);

  if (stopStrings == null && generationParameters?.stop_str) {
    const paramsStopStringJSON = generationParameters?.stop_str;

    let paramsStopStrings = [];

    try {
      paramsStopStrings = JSON.parse(paramsStopStringJSON);
    } catch {
      paramsStopStrings = [paramsStopStringJSON];
    }

    if (!Array.isArray(paramsStopStrings)) {
      setStopStrings([paramsStopStrings]);
    } else {
      setStopStrings(paramsStopStrings);
    }
  }

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
                <FormLabel>Stop Strings</FormLabel>
                <Input
                  defaultValue=""
                  name="stop_str"
                  sx={{ width: '50%' }}
                  endDecorator={
                    <Button
                      variant="soft"
                      onClick={() => {
                        setStopStrings([
                          ...stopStrings,
                          document.getElementsByName('stop_str')[0].value,
                        ]);

                        const stopStringsAsJSONArray = JSON.stringify([
                          ...stopStrings,
                          document.getElementsByName('stop_str')[0].value,
                        ]);

                        console.log('Saving: ', stopStringsAsJSONArray);

                        document.getElementsByName('stop_str')[0].value = '';
                        setGenerationParameters({
                          ...generationParameters,
                          stop_str: stopStringsAsJSONArray,
                        });
                      }}
                    >
                      Add
                    </Button>
                  }
                ></Input>
                <Box
                  role="group"
                  aria-labelledby="fav-movie"
                  sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}
                >
                  {stopStrings &&
                    Array.isArray(stopStrings) &&
                    stopStrings.length > 0 &&
                    stopStrings.map((stopString) => (
                      <Chip
                        endDecorator={
                          <ChipDelete
                            color="neutral"
                            variant="plain"
                            sx={{ ml: 0.2 }}
                            onClick={() => {
                              setStopStrings(
                                stopStrings.filter((s) => s !== stopString)
                              );
                              setGenerationParameters({
                                ...generationParameters,
                                stop_str: stopStrings.filter(
                                  (s) => s !== stopString
                                ),
                              });
                            }}
                          />
                        }
                      >
                        {stopString}
                      </Chip>
                    ))}
                </Box>
                <FormHelperText>
                  The model will stop generating text when it encounters one of
                  these strings.
                  <Button
                    variant="plain"
                    startDecorator={<RotateCcwIcon size="14px" />}
                    onClick={() => {
                      setGenerationParameters({
                        ...generationParameters,
                        stop_str: [defaultPromptConfigForModel?.stop_str],
                      });
                      setStopStrings([defaultPromptConfigForModel?.stop_str]);
                    }}
                    sx={{
                      padding: '2px',
                      margin: '0px',
                      minHeight: 'unset',
                      marginLeft: 'auto',
                    }}
                  >
                    Reset
                  </Button>
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
