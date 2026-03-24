/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useMemo } from 'react';
import {
  useSWRWithAuth as useSWR,
  useAuth,
  useAPI,
} from 'renderer/lib/authContext';

import { Button, Sheet, Stack, Typography } from '@mui/joy';

import labImage from './img/lab.jpg';

import { StretchHorizontalIcon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';

import { Link, Link as ReactRouterLink, useNavigate } from 'react-router-dom';

import DownloadFirstModelModal from '../DownloadFirstModelModal';
import HexLogo from '../Shared/HexLogo';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

export default function Welcome() {
  // For now disable ModelDownloadModal
  const [modelDownloadModalOpen, setModelDownloadModalOpen] =
    useState<boolean>(false);

  const { setExperimentId } = useExperimentInfo();
  const { team } = useAuth();

  const navigate = useNavigate();

  // Fetch providers
  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const hasProviders = providers.length > 0;
  const server = undefined as any;

  // Create experiment creation callback
  const createNewExperiment = async (name: string, fromRecipeId = null) => {
    let newId: string | number = '';

    if (fromRecipeId === null) {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.Create(name),
      );
      newId = await response.json();
    } else {
      const response = await chatAPI.authenticatedFetch(
        getAPIFullPath('recipes', ['createExperiment'], {
          id: fromRecipeId,
          experiment_name: name,
        }),
        {
          method: 'POST',
          headers: {},
        },
      );
      const responseJson = await response.json();
      if (!(responseJson?.status === 'success')) {
        alert(
          `Error creating experiment from recipe: ${responseJson?.message || 'Unknown error'}`,
        );
        return;
      }
      newId = responseJson?.data?.experiment_id;
    }
    setExperimentId(String(newId));

    // Navigate to Notes page if experiment was created from a recipe AND recipe is not blank
    if (fromRecipeId !== null && fromRecipeId !== -1) {
      navigate(`/experiment/${name}/notes`);
    }
  };

  return (
    <>
      <DownloadFirstModelModal
        open={modelDownloadModalOpen}
        setOpen={setModelDownloadModalOpen}
        server={server}
      />

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
                    Navigate to the <StretchHorizontalIcon /> <b>Tasks</b> tab
                    to launch training, evaluation, or other tasks on your
                    configured compute providers
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

            {/* <Button
              endDecorator={<ArrowRightCircleIcon />}
              size="lg"
              onClick={() => {
                navigate('/experiment/chat');
              }}
            >
              Chat 💬 with it
            </Button> */}
            {/* <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Start 🔬 with a pre-built recipe
            </Button> */}
            {/* <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Train 🧑🏽‍🎓 a new model from scratch
            </Button> */}
            {/* <Button endDecorator={<ArrowRightCircleIcon />} size="lg">
              Fine tune 🎵 it
            </Button> */}
            <Typography level="body-lg" mt={2} sx={{ fontSize: '24px' }}>
              Access our{' '}
              <a
                href="https://lab.cloud/docs/"
                target="_blank"
                rel="noreferrer"
              >
                full documentation
              </a>{' '}
              for more ideas!
            </Typography>
            {/* <Link to="/user_login_test">Test Login</Link> */}
          </div>
        </div>
      </Sheet>
    </>
  );
}
