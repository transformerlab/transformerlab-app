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

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { RotateCcwIcon } from 'lucide-react';
import SafeJSONParse from '../../Shared/SafeJSONParse';

export default function SystemMessageBox({
  experimentInfo,
  experimentInfoMutate,
  showResetButton = false,
  defaultPromptConfigForModel = {},
}: {
  experimentInfo: any;
  experimentInfoMutate: () => void;
  showResetButton?: boolean;
  defaultPromptConfigForModel?: any;
}) {
  const [systemMessage, setSystemMessage] = useState(() => {
    const promptTemplate = SafeJSONParse(
      experimentInfo?.config?.prompt_template,
      {},
    );
    return promptTemplate?.system_message;
  });

  const [hasEdited, setHasEdited] = useState(false);

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

  const sendSystemMessageToServer = (message: string) => {
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

    fetch(chatAPI.Endpoints.Experiment.SavePrompt(experimentId), {
      method: 'POST',
      body: JSON.stringify(newPrompt),
    })
      .then(() => {
        experimentInfoMutate();
        setHasEdited(false); // allow re-sync
        return true;
      })
      .catch(() => {
        // Error saving prompt
      });
  };

  useEffect(() => {
    if (!hasEdited) {
      const promptTemplate = SafeJSONParse(
        experimentInfo?.config?.prompt_template,
        {},
      );
      const experimentSystemMessage = promptTemplate?.system_message;
      const defaultSystemMessage = defaultPromptConfigForModel?.system_message;

      setSystemMessage(experimentSystemMessage || defaultSystemMessage);
    }
  }, [experimentInfo?.config?.prompt_template]);

  // Update handler with "edited" tracking
  const handleSystemMessageChange = (e: any) => {
    setSystemMessage(e.target.value);
    setHasEdited(true);
  };

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
            value={preprocessSystemMessage(systemMessage || '')}
            onChange={handleSystemMessageChange}
            sx={{
              '--Textarea-focusedThickness': '0',
              '--Textarea-focusedHighlight': 'transparent !important',
            }}
          />
        </FormControl>
      </Sheet>

      <FormHelperText
        sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}
      >
        <Button
          size="sm"
          variant="soft"
          onClick={() => sendSystemMessageToServer(systemMessage || '')}
        >
          Save
        </Button>

        {showResetButton && (
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
        )}
      </FormHelperText>
    </div>
  );
}
