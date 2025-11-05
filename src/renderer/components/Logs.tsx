/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Sheet,
  Skeleton,
  Stack,
  Typography,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import useSWR from 'swr';
import { RotateCcwIcon } from 'lucide-react';

import { fetcher } from '../lib/transformerlab-api-sdk';

function objectMinusPrompt(obj) {
  const { prompt, ...rest } = obj;
  return rest;
}

function isToday(someDateString) {
  const someDate = new Date(someDateString);
  const today = new Date();

  return (
    someDate.getDate() === today.getDate() &&
    someDate.getMonth() === today.getMonth() &&
    someDate.getFullYear() === today.getFullYear()
  );
}

function renderJSONLinesLog(logs) {
  if (!logs || typeof logs !== 'string' || logs.trim() === '') {
    return null;
  }

  return (
    logs
      ?.split('\n')
      // trim and filter out empty lines so JSON.parse won't get blank input
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((line, i) => {
        try {
          const line_object = JSON.parse(line);
          return (
            <Accordion key={i} color="primary" variant="soft">
              <AccordionSummary>
                <Typography
                  color={isToday(line_object.date) ? 'black' : 'neutral'}
                >
                  {line_object.date} - {line_object?.log?.model}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {line_object?.log?.prompt}
                </pre>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(objectMinusPrompt(line_object?.log))}
                </pre>
              </AccordionDetails>
            </Accordion>
          );
        } catch (e) {
          // skip unparsable lines
          return null;
        }
      })
  );
}

function SkeletonRows({ isLoading }) {
  return (
    <>
      <Stack gap={1} direction="column">
        {[...Array(15)].map((_, i) => (
          <Skeleton
            variant="rectangular"
            key={i}
            loading={isLoading}
            width={800}
            height="1.5em"
            sx={{}}
          />
        ))}
      </Stack>
    </>
  );
}

export default function Logs({}) {
  const { data, isLoading, mutate, error } = useSWR(
    chatAPI.Endpoints.Global.PromptLog,
    // ensure the fetcher treats the response as text
    (url) => fetcher(url, undefined, false),
  );

  React.useEffect(() => {
    // Scroll to bottom when data changes (guard for missing element)
    const ae = document.getElementById('logs_accordion');
    if (ae) ae.scrollTop = ae.scrollHeight;
  }, [data]);

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonRows isLoading={isLoading} />;
    }

    if (error) {
      return <Typography>Error loading logs: {error?.message}</Typography>;
    }

    if (!data || typeof data !== 'string' || data.trim() === '') {
      return (
        <Typography level="body-md" color="neutral">
          No logs available
        </Typography>
      );
    }

    return <AccordionGroup>{renderJSONLinesLog(data)}</AccordionGroup>;
  };

  return (
    <Sheet
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingBottom: '1rem',
      }}
    >
      <Stack direction="row" spacing={1} mb={2} justifyContent="space-between">
        <Typography level="h1">Prompt Log</Typography>
        <IconButton
          onClick={() => {
            mutate();
          }}
        >
          <RotateCcwIcon style={{ width: '18px', height: '18px' }} />
        </IconButton>
      </Stack>
      <Box
        id="logs_accordion"
        style={{
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {renderContent()}
      </Box>
    </Sheet>
  );
}
