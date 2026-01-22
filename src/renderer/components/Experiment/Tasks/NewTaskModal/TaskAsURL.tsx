// This file is a placeholder as we split things out

import React from 'react';
import {
  Stack,
  FormControl,
  FormLabel,
  Input,
  FormHelperText,
  CircularProgress,
  Typography,
} from '@mui/joy';

interface TaskAsURLProps {
  taskJsonUrl: string;
  setTaskJsonUrl: (url: string) => void;
  setTaskJsonData: (data: any) => void;
  setTaskMode: (mode: any) => void;
  isYamlMode: boolean;
  setYamlContent: (content: string) => void;
  isLoadingTaskJson: boolean;
}

const TaskAsURL: React.FC<TaskAsURLProps> = ({
  taskJsonUrl,
  setTaskJsonUrl,
  setTaskJsonData,
  setTaskMode,
  isYamlMode,
  setYamlContent,
  isLoadingTaskJson,
}) => {
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setTaskJsonUrl(newUrl);
    // Clear task.json data when URL changes so it can be reloaded
    setTaskJsonData(null);
    setTaskMode(null);
    // Clear YAML if in YAML mode so it can reload
    if (isYamlMode) {
      setYamlContent('');
    }
  };

  return (
    <Stack spacing={3}>
      <FormControl>
        <FormLabel>Task.json URL (Optional)</FormLabel>
        <Input
          value={taskJsonUrl}
          onChange={handleUrlChange}
          placeholder="https://raw.githubusercontent.com/owner/repo/branch/path/task.json"
          disabled={isLoadingTaskJson}
        />
        <FormHelperText>
          Leave blank to create a task from scratch
        </FormHelperText>
      </FormControl>
      {isLoadingTaskJson && (
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size="sm" />
          <Typography level="body-sm">Loading task.json from URL...</Typography>
        </Stack>
      )}
    </Stack>
  );
};

export default TaskAsURL;
