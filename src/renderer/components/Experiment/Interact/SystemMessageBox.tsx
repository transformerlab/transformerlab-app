import {
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Sheet,
  Textarea,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
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
  // Check if override is enabled from experiment config
  const promptTemplate = SafeJSONParse(
    experimentInfo?.config?.prompt_template,
    {},
  );

  const [isOverrideEnabled, setIsOverrideEnabled] = useState(() => {
    return promptTemplate?.system_prompt_override === true;
  });

  const [customSystemMessage, setCustomSystemMessage] = useState(() => {
    return promptTemplate?.system_message || '';
  });

  const [hasEdited, setHasEdited] = useState(false);

  // Get the current system message to display
  const getDisplayedSystemMessage = () => {
    if (isOverrideEnabled) {
      return customSystemMessage;
    }
    return defaultPromptConfigForModel?.system_message || '';
  };

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

  const savePromptToServer = (promptData: any) => {
    const experimentId = experimentInfo?.id;

    fetch(chatAPI.Endpoints.Experiment.SavePrompt(experimentId), {
      method: 'POST',
      body: JSON.stringify(promptData),
    })
      .then(() => {
        experimentInfoMutate();
        setHasEdited(false);
        return true;
      })
      .catch(() => {
        // Error saving prompt
      });
  };

  const handleOverrideToggle = (checked: boolean) => {
    setIsOverrideEnabled(checked);

    let newPrompt = experimentInfo?.config?.prompt_template;

    // If undefined, initialize it as an empty object
    if (newPrompt === undefined || newPrompt === null) {
      newPrompt = {};
    }

    // Make new prompt as json
    if (typeof newPrompt === 'string') {
      newPrompt = JSON.parse(newPrompt);
    }

    if (checked) {
      // Enable override - set flag and current custom message
      newPrompt.system_prompt_override = true;
      newPrompt.system_message =
        customSystemMessage ||
        defaultPromptConfigForModel?.system_message ||
        '';
    } else {
      // Disable override - remove flag and system_message field
      delete newPrompt.system_prompt_override;
      delete newPrompt.system_message;
    }

    savePromptToServer(newPrompt);
  };

  const handleSystemMessageChange = (e: any) => {
    setCustomSystemMessage(e.target.value);
    setHasEdited(true);
  };

  const handleSave = () => {
    if (!isOverrideEnabled) return;

    let newPrompt = experimentInfo?.config?.prompt_template;

    // If undefined, initialize it as an empty object
    if (newPrompt === undefined || newPrompt === null) {
      newPrompt = {};
    }

    // Make new prompt as json
    if (typeof newPrompt === 'string') {
      newPrompt = JSON.parse(newPrompt);
    }

    // Preprocess system message to replace date placeholders
    const processedMessage = preprocessSystemMessage(customSystemMessage);

    newPrompt.system_prompt_override = true;
    newPrompt.system_message = processedMessage;

    savePromptToServer(newPrompt);
  };

  // Update state when experiment info changes (e.g., model change)
  useEffect(() => {
    const currentPromptTemplate = SafeJSONParse(
      experimentInfo?.config?.prompt_template,
      {},
    );

    const overrideEnabled =
      currentPromptTemplate?.system_prompt_override === true;
    setIsOverrideEnabled(overrideEnabled);

    if (overrideEnabled) {
      setCustomSystemMessage(currentPromptTemplate?.system_message || '');
    }

    setHasEdited(false);
  }, [
    experimentInfo?.config?.prompt_template,
    defaultPromptConfigForModel?.system_message,
  ]);

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

      {/* Override checkbox */}
      <FormControl sx={{ marginBottom: 2 }}>
        <Checkbox
          label="Use Custom System Prompt"
          checked={isOverrideEnabled}
          onChange={(e) => handleOverrideToggle(e.target.checked)}
        />
      </FormControl>

      <Sheet
        variant="outlined"
        id="system-message-box"
        sx={{
          width: '100%',
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
            value={preprocessSystemMessage(getDisplayedSystemMessage())}
            onChange={handleSystemMessageChange}
            readOnly={!isOverrideEnabled}
            sx={{
              '--Textarea-focusedThickness': '0',
              '--Textarea-focusedHighlight': 'transparent !important',
              opacity: isOverrideEnabled ? 1 : 0.7,
              cursor: isOverrideEnabled ? 'text' : 'default',
            }}
          />
        </FormControl>
      </Sheet>

      <FormHelperText
        sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}
      >
        {isOverrideEnabled && (
          <Button
            size="sm"
            variant="soft"
            onClick={handleSave}
            disabled={!hasEdited}
          >
            Save
          </Button>
        )}

        {showResetButton && isOverrideEnabled && (
          <Button
            variant="plain"
            startDecorator={<RotateCcwIcon size="14px" />}
            onClick={() => {
              setCustomSystemMessage(
                defaultPromptConfigForModel?.system_message || '',
              );
              setHasEdited(true);
            }}
            sx={{
              padding: '2px',
              margin: '0px',
              minHeight: 'unset',
              marginLeft: 'auto',
            }}
          >
            Reset to Default
          </Button>
        )}
      </FormHelperText>
    </div>
  );
}
