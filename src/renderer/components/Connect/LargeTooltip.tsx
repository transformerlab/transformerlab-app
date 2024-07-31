import { Box, Chip, Typography } from '@mui/joy';

import DetailedTooltips from './DetailedTooltipsForEachStep.json';

export default function LargeTooltip({ stepNumber }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 320,
        justifyContent: 'center',
        p: 1,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
        <div>
          <div>
            <Typography fontWeight="lg" fontSize="sm">
              More Information:
            </Typography>
          </div>
          <Typography textColor="text.secondary" fontSize="sm" sx={{ mb: 1 }}>
            {DetailedTooltips[stepNumber]}
          </Typography>
        </div>
      </Box>
    </Box>
  );
}
