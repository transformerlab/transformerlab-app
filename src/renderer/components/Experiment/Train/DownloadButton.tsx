/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import { Button, LinearProgress, Stack } from '@mui/joy';
import { CheckIcon, DownloadIcon } from 'lucide-react';

export default function DownloadButton({
  initialMessage = 'Download',
  completeMessage = 'Downloaded',
  icon = <DownloadIcon size="15px" />,
  variant = 'outlined',
  action = () => {},
}) {
  const [selected, setSelected] = useState(false);
  const [progress, setProgress] = useState(0);

  function incrementProgress(currentProgress: number) {
    if (currentProgress >= 100) {
      // setSelected(false);
    } else {
      setProgress(currentProgress + 10);
      setTimeout(() => {
        incrementProgress(currentProgress + 10);
      }, 700);
    }
  }

  if (progress >= 100) {
    return (
      <Button
        size="sm"
        variant="outlined"
        color="primary"
        onClick={() => {
          setSelected(true);

          incrementProgress(0);

          action();
        }}
        endDecorator={<CheckIcon />}
      >
        {completeMessage}
      </Button>
    );
  }
  return selected ? (
    <Stack spacing={2} sx={{ flex: 1 }}>
      <LinearProgress determinate value={progress} />
    </Stack>
  ) : (
    <Button
      size="sm"
      variant={variant}
      color="neutral"
      onClick={() => {
        setSelected(true);

        incrementProgress(0);
      }}
      endDecorator={icon}
    >
      {initialMessage}
    </Button>
  );
}
