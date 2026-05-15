/* eslint-disable jsx-a11y/anchor-is-valid */
import { Sheet, Stack, Typography } from '@mui/joy';

import { StretchHorizontalIcon } from 'lucide-react';

import labImage from './img/lab.jpg';
import HexLogo from '../Shared/HexLogo';

export default function Welcome() {
  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: 'calc(100% - 1em)',
        backgroundImage: `url("${labImage}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 3,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--joy-palette-background-surface)',
          opacity: '0.85',
          padding: '2rem',
          overflowY: 'auto',
        }}
      >
        <Typography
          level="h1"
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <HexLogo width={40} height={40} /> Transformer Lab
        </Typography>
        <Typography level="h1" sx={{ fontSize: '48px' }} mb={2}>
          Let's start your next Experiment! 🤓
        </Typography>
        <div>
          <Typography level="body-lg" sx={{ fontSize: '24px' }} mb={2}>
            Get started by creating a new experiment and launching tasks from
            the <StretchHorizontalIcon /> <b>Tasks</b> menu tab.
          </Typography>
          <Stack
            direction="column"
            justifyContent="flex-start"
            alignItems="flex-start"
            spacing={2}
          >
            <ul>
              <li>
                <Typography level="body-lg" sx={{ fontSize: '20px' }}>
                  <b>Create an experiment</b> by clicking on the experiment
                  dropdown and selecting <b>New</b>
                </Typography>
              </li>
              <li>
                <Typography level="body-lg" sx={{ fontSize: '20px' }}>
                  Navigate to the <StretchHorizontalIcon /> <b>Tasks</b> tab to
                  launch training, evaluation, or other tasks on your configured
                  compute providers
                </Typography>
              </li>
              <li>
                <Typography level="body-lg" sx={{ fontSize: '20px' }}>
                  Tasks will run on your available compute providers, allowing
                  you to leverage cloud resources or remote servers
                </Typography>
              </li>
            </ul>
          </Stack>
          <Typography level="body-lg" mt={2} sx={{ fontSize: '24px' }}>
            Access our{' '}
            <a
              href="https://lab.cloud/for-teams/"
              target="_blank"
              rel="noreferrer"
            >
              full documentation
            </a>{' '}
            for more ideas!
          </Typography>
        </div>
      </div>
    </Sheet>
  );
}
