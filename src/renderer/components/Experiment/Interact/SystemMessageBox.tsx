import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Sheet,
  Textarea,
  Typography,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { RotateCcwIcon } from 'lucide-react';

export default function SystemMessageBox({
  experimentInfo,
  experimentInfoMutate,
  showResetButton = false,
  defaultPromptConfigForModel = {},
}) {
  const [systemMessage, setSystemMessage] = useState(
    experimentInfo?.config?.prompt_template?.system_message
  );

  const sendSystemMessageToServer = (message) => {
    // console.log(`Sending message: ${message} to the server`);
    const experimentId = experimentInfo?.id;
    const newSystemPrompt = message;

    var newPrompt = {
      ...experimentInfo?.config?.prompt_template,
    };
    newPrompt.system_message = newSystemPrompt;

    fetch(chatAPI.SAVE_EXPERIMENT_PROMPT_URL(experimentId), {
      method: 'POST',
      body: JSON.stringify(newPrompt),
    }).then((response) => {
      experimentInfoMutate();
    });
  };

  const [debouncedSystemMessage] = useDebounce(systemMessage, 1000);

  // Update server after a delay of 1 second
  useEffect(() => {
    if (
      debouncedSystemMessage !==
      experimentInfo?.config?.prompt_template?.system_message
    ) {
      sendSystemMessageToServer(systemMessage);
    }
  }, [debouncedSystemMessage]); // useEffect will be called whenever systemMessage changes

  // Update if the server has been updated with a new message
  useEffect(() => {
    setSystemMessage(
      experimentInfo?.config?.prompt_template?.system_message ||
        defaultPromptConfigForModel?.system_message
    );
  }, [experimentInfo?.config?.prompt_template?.system_message]);

  return (
    <div>
      <FormLabel
        sx={{
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: '3px',
        }}
      >
        <span>System message</span>
        <span>
          <Typography level="body-xs" sx={{ ml: 'auto' }}>
            {systemMessage != debouncedSystemMessage ? 'Saving...' : ''}
          </Typography>
        </span>
      </FormLabel>
      <Sheet
        variant="outlined"
        id="system-message-box"
        sx={{
          width: '100%',
          // borderRadius: "md",
          flex: '0 0 130px',
          overflow: 'auto',
          padding: 2,
        }}
      >
        <FormControl>
          <Textarea
            variant="plain"
            name="system-message"
            minRows={1}
            maxRows={8}
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            sx={{
              '--Textarea-focusedThickness': '0',
              '--Textarea-focusedHighlight': 'transparent !important',
            }}
          />
        </FormControl>
      </Sheet>
      {showResetButton && (
        <FormHelperText>
          <Button
            variant="plain"
            startDecorator={<RotateCcwIcon size="14px" />}
            onClick={() => {
              sendSystemMessageToServer(
                defaultPromptConfigForModel?.system_message || ''
              );
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
      )}
    </div>
  );
}
