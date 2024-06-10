/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import { Button, LinearProgress, Stack } from '@mui/joy';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';

export default function LoRATrainingRunButton({
  initialMessage,
  action = () => {},
  trainingTemplateId,
  jobsMutate,
  experimentId,
}) {
  const [progress, setProgress] = useState(0);
  let job_data = {
    template_id: trainingTemplateId,
  };
  return (
    <Button
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
