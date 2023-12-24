import { useState } from 'react';
import useSWR from 'swr';
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  LinearProgress,
  Sheet,
  Textarea,
  Typography,
} from '@mui/joy';

import { ListRestartIcon, PencilIcon, SaveIcon } from 'lucide-react';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

function resetValuesToDefaults(model) {
  fetch(chatAPI.TEMPLATE_FOR_MODEL_URL(model))
    .then((response) => response.text())
    .then((data) => {
      console.log(data);
      data = JSON.parse(data);
      document.getElementsByName('system_message')[0].value =
        data?.system_message;
      document.getElementsByName('system_template')[0].value =
        data?.system_template;
      document.getElementsByName('human')[0].value = data?.roles[0];
      document.getElementsByName('bot')[0].value = data?.roles[1];
      return data;
    })
    .catch((err) => console.log(err));
}

export default function Prompt({
  experimentId,
  experimentInfo,
  experimentInfoMutate,
}) {
  const [isEditing, setIsEditing] = useState(false);

  const { data, error, isLoading } = useSWR(
    chatAPI.TEMPLATE_FOR_MODEL_URL(experimentInfo?.config?.foundation),
    fetcher
  );

  const parsedPromptData = experimentInfo?.config?.prompt_template;
  const model = experimentInfo?.config?.foundation;

  if (experimentId === '') {
    return <div>Select an Experiment</div>;
  }

  // This is a hack: it reloads and resets the form when the component is loaded
  document.getElementById('prompt-form')?.reset();

  if (isLoading) return <LinearProgress />;
  if (error) return <div>Failed to load prompt data from API</div>;
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        xoverflowX: 'hidden',
        padding: 1,
      }}
    >
      <form
        id="prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const formJson = Object.fromEntries((formData as any).entries());
          // alert(JSON.stringify(formJson));
          fetch(chatAPI.SAVE_EXPERIMENT_PROMPT_URL(experimentId), {
            method: 'POST',
            body: JSON.stringify(formJson),
          })
            .then((response) => {
              experimentInfoMutate();
              return response.text();
            })
            .then((data) => console.log(data))
            .catch((err) => console.log(err));

          setIsEditing(false);
        }}
      >
        <Typography level="h1" paddingTop={0} paddingBottom={1}>
          Prompt
        </Typography>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginBottom: '10px',
            }}
          >
            {!isEditing ? (
              <Button
                startDecorator={<PencilIcon />}
                onClick={() => {
                  setIsEditing(true);
                }}
              >
                Edit
              </Button>
            ) : (
              <Button
                variant="outlined"
                startDecorator={<ListRestartIcon />}
                onClick={() => {
                  resetValuesToDefaults(model);
                }}
                color="danger"
              >
                Reset to Defaults {model && 'for'} {model}
              </Button>
            )}
            {isEditing && (
              <Button
                type="submit"
                startDecorator={<SaveIcon />}
                color="success"
              >
                Save
              </Button>
            )}
          </div>

          <FormControl>
            <FormLabel>System Message:</FormLabel>
            <Textarea
              defaultValue={parsedPromptData?.system_message}
              disabled={!isEditing}
              variant="outlined"
              name="system_message"
              minRows={4}
            />
            <FormHelperText>
              This text is prepended to the start of a conversation and serves
              as a hidden intruction to the model.
            </FormHelperText>
          </FormControl>
          <br />
          <FormControl>
            <FormLabel>Template:</FormLabel>
            <Textarea
              placeholder="{system_message}"
              variant="outlined"
              defaultValue={parsedPromptData?.system_template}
              name="system_template"
              minRows={5}
              disabled={!isEditing}
            />
            <FormHelperText>
              Use this template to format how to send all data to the model. Use
              curly braces to refer to available fields.
            </FormHelperText>
          </FormControl>
          <AccordionGroup variant="outlined" size="lg" sx={{ marginTop: 3 }}>
            <Accordion>
              <AccordionSummary>Conversation Format</AccordionSummary>
              <AccordionDetails>
                <FormControl>
                  <FormLabel>Human:</FormLabel>
                  <Input name="human" defaultValue={data?.roles[0]} />
                  <FormHelperText>
                    Within a chat template, refer to the human by this name.
                  </FormHelperText>
                </FormControl>
                <br />
                <FormControl>
                  <FormLabel>Agent:</FormLabel>
                  <Input name="bot" defaultValue={data?.roles[1]} />
                  <FormHelperText>
                    Within a chat template, refer to the Agent by this name.
                  </FormHelperText>
                </FormControl>
                <br />
                <FormControl>
                  <FormLabel> Chat Format:</FormLabel>
                  <Textarea
                    placeholder={JSON.stringify(data?.messages)}
                    variant="outlined"
                    name="messages"
                    minRows={8}
                    endDecorator={
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 'var(--Textarea-paddingBlock)',
                          pt: 'var(--Textarea-paddingBlock)',
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          flex: 'auto',
                        }}
                      >
                        <Button sx={{ ml: 'auto' }} color="neutral">
                          Save{' '}
                        </Button>
                      </Box>
                    }
                  />{' '}
                  <FormHelperText>
                    Within a chat template, refer to the human by this name.
                  </FormHelperText>
                </FormControl>
              </AccordionDetails>
            </Accordion>
            <Accordion>
              <AccordionSummary>Other</AccordionSummary>
              <AccordionDetails>
                <FormControl>
                  <FormLabel>Offset:</FormLabel>
                  <Input value={data?.offset} />
                </FormControl>
                <FormControl>
                  <FormLabel>Separation Style:</FormLabel>
                  <Input value={data?.sep_style} />
                </FormControl>
                <FormControl>
                  <FormLabel>Separator Style:</FormLabel>
                  <Input value={data?.sep_style} />
                </FormControl>
                <FormControl>
                  <FormLabel>Separator 1:</FormLabel>
                  <Input value={JSON.stringify(data?.sep)} />
                  <FormHelperText>
                    Surround with double quotations marks (they will not be
                    included)
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Separator 2:</FormLabel>
                  <Input value={JSON.stringify(data?.sep2)} />
                  <FormHelperText>
                    Surround with double quotations marks (they will not be
                    included)
                  </FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Stop String:</FormLabel>
                  <Input value={JSON.stringify(data?.stop_str)} />
                </FormControl>
                <FormHelperText>
                  Surround with double quotations marks (they will not be
                  included)
                </FormHelperText>
                <FormControl>
                  <FormLabel>Stop Token IDs:</FormLabel>
                  <Input value={data?.stop_token_ids} />
                </FormControl>
              </AccordionDetails>
            </Accordion>
          </AccordionGroup>
        </div>
      </form>
    </Sheet>
  );
}
