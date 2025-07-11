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
    experimentInfo?.config?.prompt_template?.system_message,
  );

  // Function to preprocess system message with date placeholders
  const preprocessSystemMessage = (message: string) => {
    if (!message) return message;
    
    let processedMessage = message;
    const currentDate = new Date();

    // Replace {{currentDateTime}} with YYYY-MM-DD format
    const currentDateFormatted = currentDate.toISOString().split('T')[0];
    processedMessage = processedMessage.replace(
      /\{\{currentDateTime\}\}/g,
      currentDateFormatted,
    );

    // Replace {{currentDateTimev2}} with DD MMM YYYY format
    const currentDateV2 = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    processedMessage = processedMessage.replace(
      /\{\{currentDateTimev2\}\}/g,
      currentDateV2,
    );

    // Replace {{currentDateTimev3}} with MMMM YYYY format
    const currentDateV3 = currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    processedMessage = processedMessage.replace(
      /\{\{currentDateTimev3\}\}/g,
      currentDateV3,
    );

    return processedMessage;
  };

  // Get the processed message to display
  const displayMessage = preprocessSystemMessage(systemMessage || '');

  const sendSystemMessageToServer = (message: string) => {
    // console.log(`Sending message: ${message} to the server`);
    const experimentId = experimentInfo?.id;

    // Preprocess system message to replace date placeholders
    const processedMessage = preprocessSystemMessage(message);
    const newSystemPrompt = processedMessage;

    let newPrompt = experimentInfo?.config?.prompt_template;

    // If undefined, initialize it as an empty object
    if (newPrompt === undefined || newPrompt === null) {
      newPrompt = {};
    }

    // Make new prompt as json
    if (typeof newPrompt === 'string') {
      newPrompt = JSON.parse(newPrompt);
    }
    newPrompt.system_message = newSystemPrompt;

    // console.log('STRINGIFY NEW PROMPT', JSON.stringify(newPrompt));

    fetch(chatAPI.Endpoints.Experiment.SavePrompt(experimentId), {
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
        defaultPromptConfigForModel?.system_message,
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
            {systemMessage !== debouncedSystemMessage ? 'Saving...' : ''}
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
            value={displayMessage}
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
                defaultPromptConfigForModel?.system_message || '',
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
