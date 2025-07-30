import React, { useState } from 'react';
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  TextField,
  Paper,
} from '@mui/material';

interface CheckpointingConfigPanelProps {
  onConfigChange?: (config: CheckpointingConfig) => void;
}

interface CheckpointingConfig {
  checkpointEverySteps: number;
  retainCheckpoints: number;
}

const CheckpointingConfigPanel: React.FC<CheckpointingConfigPanelProps> = ({
  onConfigChange,
}) => {
  const [config, setConfig] = useState<CheckpointingConfig>({
    checkpointEverySteps: 100,
    retainCheckpoints: 3,
  });

  const handleConfigUpdate = (
    field: keyof CheckpointingConfig,
    value: number,
  ) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Checkpointing Configuration
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
        <FormControl>
          <FormLabel>Checkpoint Every X Steps</FormLabel>
          <TextField
            type="number"
            value={config.checkpointEverySteps}
            onChange={(e) =>
              handleConfigUpdate(
                'checkpointEverySteps',
                parseInt(e.target.value) || 0,
              )
            }
            inputProps={{ min: 1 }}
            size="small"
            sx={{ mt: 1 }}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Retain Up to X Checkpoints</FormLabel>
          <TextField
            type="number"
            value={config.retainCheckpoints}
            onChange={(e) =>
              handleConfigUpdate(
                'retainCheckpoints',
                parseInt(e.target.value) || 0,
              )
            }
            inputProps={{ min: 1 }}
            size="small"
            sx={{ mt: 1 }}
          />
        </FormControl>
      </Box>
    </Paper>
  );
};

export default CheckpointingConfigPanel;
