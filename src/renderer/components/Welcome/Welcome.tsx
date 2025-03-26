/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';
import useSWR from 'swr';

import { Button, Sheet, Stack, Typography } from '@mui/joy';

import labImage from './img/lab.jpg';

import {
  ArrowRightCircleIcon,
  BoxesIcon,
  GraduationCapIcon,
  LayersIcon,
  MessageCircleIcon,
  PlayCircle,
  PlayCircleIcon,
} from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';

import DownloadFirstModelModal from '../DownloadFirstModelModal';
import HexLogo from '../Shared/HexLogo';

const fetcher = (url) => fetch(url).then((res) => res.json());

function recommendedModel(cpu, os, device) {
  if (!cpu || !os || !device) return '';

  if (cpu == 'arm64' && os == 'Darwin') {
    return 'Llama-3.2-1B-Instruct-4bit (MLX)';
  }

  if (device == 'cuda') {
    return 'Tiny Llama';
  }

  return 'GGUF models';
  // return `${cpu}, ${os}, ${device}`;
}

function typeOfComputer(cpu, os, device) {
  if (!cpu || !os || !device) return '';

  if (cpu == 'arm64' && os == 'Darwin') {
    return 'Apple Silicon Mac';
  }

  return `${cpu} based ${os} computer with ${device} support`;
}

export default function Welcome() {
  // Check number of downloaded models
  let model_count = 0;
  const { data: modelCountResponse } = useSWR(
    chatAPI.Endpoints.Models.CountDownloaded(),
    fetcher,
  );
  if (modelCountResponse && modelCountResponse!.data) {
    model_count = modelCountResponse!.data;
  }

  // Open DownloadFirstModelModal if the user has no models
  const [modelDownloadModalOpen, setModelDownloadModalOpen] =
    useState<boolean>(false);

  const { server, isLoading, isError } = chatAPI.useServerStats();

  const navigate = useNavigate();

  const cpu = server?.cpu;
  const os = server?.os;
  const device = server?.device;

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
              Get started by downloading a small model from the <BoxesIcon />{' '}
              Model Zoo. <b>{recommendedModel(cpu, os, device)}</b> could be a
              great starting point for your {typeOfComputer(cpu, os, device)}.
              After downloading a model, you can:
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
                    <b>Run it</b> by clicking on <LayersIcon /> Foundation then
                    press <PlayCircleIcon /> Run{' '}
                  </Typography>
                </li>
                <li>
                  <Typography level="body-lg" sx={{ fontSize: '20px' }}>
                    Once a model is running, you can <b>Chat</b> with it by
                    clicking on <MessageCircleIcon /> Interact
                  </Typography>
                </li>
                <li>
                  <Typography level="body-lg" sx={{ fontSize: '20px' }}>
                    <b>Fine tune</b> a model by clicking on{' '}
                    <GraduationCapIcon /> Train
                  </Typography>
                </li>
              </ul>
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
            </Stack>
            <Typography level="body-lg" mt={2} sx={{ fontSize: '24px' }}>
              Watch our{' '}
              <a href="https://transformerlab.ai/docs/intro" target="_blank">
                Getting Started Video
              </a>
              , or access our{' '}
              <a href="https://transformerlab.ai/docs/intro" target="_blank">
                full documentation
              </a>{' '}
              for more ideas!
            </Typography>
          </div>
        </div>
      </Sheet>
    </>
  );
}
