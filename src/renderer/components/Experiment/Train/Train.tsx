/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import { Button, Table, Typography } from '@mui/joy';
import { CheckIcon, FileTextIcon, PlayIcon } from 'lucide-react';
import DownloadButton from './DownloadButton';

export default function Train() {
  return (
    <>
      {/* <Typography level="h3">Chat with current Model:</Typography> */}
      <Sheet>
        <Typography level="h1">Train / Finetune</Typography>

        <Typography color="neutral" level="body-md" mt={4}>
          Full training will be implemented soon. Please use LoRA Finetuning.
        </Typography>
      </Sheet>
    </>
  );
}
