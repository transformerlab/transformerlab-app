import {
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormLabel,
  Sheet,
  Textarea,
} from '@mui/joy';
import { useEffect, useState } from 'react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import SafeJSONParse from '../../Shared/SafeJSONParse';

export default function SystemMessageBox({
  experimentInfo,
  experimentInfoMutate,
  defaultPromptConfigForModel = {},
}: {
  experimentInfo: any;
  experimentInfoMutate: () => void;
  defaultPromptConfigForModel?: any;
}) {
  // Check if override is enabled from experiment config
  const promptTemplate = SafeJSONParse(
    experimentInfo?.config?.prompt_template,
    {},
  );

  const [isOverrideEnabled, setIsOverrideEnabled] = useState(() => {
    return promptTemplate?.system_message_override === true;
  });

  const [customSystemMessage, setCustomSystemMessage] = useState(() => {
    return promptTemplate?.system_message || '';
  });

  const [hasEdited, setHasEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');

  // Get the current system message to display
  const getDisplayedSystemMessage = () => {
    if (isOverrideEnabled) {
      // If we're saving, show the message we're trying to save
      if (isSaving && savingMessage) {
        return savingMessage;
      }
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
        return true;
      })
      .catch(() => {
        // Error saving prompt
      });
  };

  const handleOverrideToggle = (checked: boolean) => {
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
      newPrompt.system_message_override = true;
      newPrompt.system_message =
        customSystemMessage ||
        defaultPromptConfigForModel?.system_message ||
        '';
    } else {
      // Disable override - remove flag and system_message field
      delete newPrompt.system_message_override;
      delete newPrompt.system_message;
    }

    // Update state only after server call to avoid timing issues
    savePromptToServer(newPrompt);
    // Note: setIsOverrideEnabled will be updated via useEffect when experimentInfoMutate triggers
  };

  const handleSystemMessageChange = (e: any) => {
    setCustomSystemMessage(e.target.value);
    setHasEdited(true);
  };

  const handleSave = () => {
    if (!isOverrideEnabled || isSaving) return;

    setIsSaving(true);
    // Store the message we're trying to save
    setSavingMessage(customSystemMessage);

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

    newPrompt.system_message_override = true;
    newPrompt.system_message = processedMessage;

    savePromptToServer(newPrompt);

    // Keep the saving state for 900ms to give visual feedback
    setTimeout(() => {
      setIsSaving(false);
      setHasEdited(false);
      setSavingMessage('');
    }, 900);
  };

  // Update state when experiment info changes (e.g., model change)
  useEffect(() => {
    // Don't update state while saving to prevent flickering
    if (isSaving) return;

    const currentPromptTemplate = SafeJSONParse(
      experimentInfo?.config?.prompt_template,
      {},
    );

    const overrideEnabled =
      currentPromptTemplate?.system_message_override === true;
    setIsOverrideEnabled(overrideEnabled);

    if (overrideEnabled) {
      setCustomSystemMessage(currentPromptTemplate?.system_message || '');
    }

    setHasEdited(false);
  }, [
    experimentInfo?.config?.prompt_template,
    defaultPromptConfigForModel?.system_message,
    isSaving,
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

      <Sheet
        variant="outlined"
        id="system-message-box"
        sx={{
          width: '100%',
          flex: '0 0 130px',
          overflow: 'auto',
          padding: 2,
          position: 'relative',
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
              paddingBottom:
                isOverrideEnabled && (hasEdited || isSaving) ? '40px' : '0px',
            }}
          />
        </FormControl>

        {isOverrideEnabled && (hasEdited || isSaving) && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <Button
              size="sm"
              variant="solid"
              onClick={handleSave}
              disabled={isSaving}
              startDecorator={
                isSaving ? <CircularProgress size="sm" /> : undefined
              }
              sx={{
                padding: '4px 12px',
                fontSize: '12px',
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </Sheet>

      <FormControl sx={{ marginTop: 1, marginBottom: 1 }}>
        <Checkbox
          label="Use Custom System Message"
          checked={isOverrideEnabled}
          onChange={(e) => handleOverrideToggle(e.target.checked)}
          sx={{
            fontSize: 'sm',
            '& .MuiCheckbox-label': {
              fontSize: 'sm',
            },
          }}
        />
      </FormControl>
    </div>
  );
}
