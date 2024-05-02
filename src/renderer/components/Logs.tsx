/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Box,
  Sheet,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.text());

function objectMinusPrompt({
  prompt,
  ...rest
}: Record<string, any>): Record<string, any> {
  return rest;
}

function renderJSONLinesLog(logs: string) {
  return logs?.split('\n').map((line, i) => {
    try {
      const line_object = JSON.parse(line);
      return (
        <>
          {/* {i}:{' '} */}
          <Accordion key={i} color="primary" variant="soft">
            <AccordionSummary>
              {line_object.date} - {line_object?.log?.model}
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
        </>
      );
    } catch (e) {
      return (
        <>
          {/* {i}: {e.message} - {line} */}
          <br />
        </>
      );
    }
  });
}

export default function Logs({}) {
  const { data } = useSWR(chatAPI.Endpoints.Global.PromptLog, fetcher);
  return (
    <Sheet style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h1>Prompt Log</h1>
      <Box
        style={{
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AccordionGroup>{renderJSONLinesLog(data ?? '')}</AccordionGroup>
      </Box>
    </Sheet>
  );
}
