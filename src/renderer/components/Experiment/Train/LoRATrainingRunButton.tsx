/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import { Button, LinearProgress, Stack } from '@mui/joy';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { PlayIcon } from 'lucide-react';

export default function LoRATrainingRunButton({
  initialMessage,
  action = () => {},
  trainingTemplate,
  jobsMutate,
  experimentId,
}) {
  const [progress, setProgress] = useState(0);
  let job_data = trainingTemplate;
  return (
    <Button
      variant="solid"
      color="primary"
      endDecorator={<PlayIcon size="14px" />}
      onClick={async () => {
        // Use fetch API to call endpoint
        await fetch(
          chatAPI.Endpoints.Jobs.Create(
            experimentId,
            'TRAIN',
            'QUEUED',
            JSON.stringify(job_data)
          )
        )
          .then((response) => response.json())
          .then((data) => console.log(data))
          .catch((error) => console.log(error));
        jobsMutate();
      }}
    >
      {initialMessage}
    </Button>
  );
}
