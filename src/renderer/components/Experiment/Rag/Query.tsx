/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Alert,
  Box,
  FormControl,
  FormLabel,
  Input,
  LinearProgress,
  Typography,
} from '@mui/joy';
import { SendHorizonalIcon } from 'lucide-react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* Pass this function an error from the RAG query and it will attempt to diagnose the error and return a helpful message */
const tryToDiagnoseRAGError = (error: string) => {
  if (error.includes('_get_available_context_size')) {
    return ': The model has too small of a context length. Adjust the context length using the Configure button below, or use a model with larger context window.';
  }
  return '';
};

export default function Query({ experimentInfo }) {
  const { models } = chatAPI.useModelStatus();

  const [response, setResponse] = React.useState({ response: '' });
  const [isLoading, setIsLoading] = React.useState(false);

  const getResponse = async (query: string, settings: string) => {
    if (!models?.[0]?.id) {
      alert('No running model found. Please start a model first.');
      return;
    }
    setIsLoading(true);
    setResponse({ response: '' });
    const response = await fetch(
      chatAPI.Endpoints.Rag.Query(
        experimentInfo.id,
        experimentInfo?.config?.foundation,
        query,
        settings
      )
    );
    const data = await response.json();
    // console.log(data);
    setIsLoading(false);
    setResponse(data);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        width: '100%',
        justifyContent: 'space-between',
        marginBottom: '0rem',
      }}
    >
      <Box sx={{ flex: 3, maxWidth: '800px', overflow: 'hidden' }}>
        <Box
          sx={{
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <FormControl>
            <FormLabel sx={{ minHeight: '32px' }}>Your question:</FormLabel>
            <Input
              placeholder="What are the top six reasons for suffering?"
              name="query"
              endDecorator={
                <SendHorizonalIcon
                  onClick={() => {
                    const query = document.getElementsByName('query')[0].value;
                    getResponse(
                      query,
                      experimentInfo?.config?.rag_engine_settings
                    );
                  }}
                />
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const query = document.getElementsByName('query')[0].value;
                  getResponse(
                    query,
                    experimentInfo?.config?.rag_engine_settings
                  );
                }
              }}
            />
            {/* <FormHelperText>This is a helper text.</FormHelperText> */}
          </FormControl>
          {isLoading && <LinearProgress size="sm" />}
          <Box
            mt={1}
            sx={{
              overflow: 'auto',
              height: '100%',
              '& .editableSheetContent': {
                borderLeft: '2px solid var(--joy-palette-neutral-500)',
                paddingLeft: '1rem',
              },
            }}
            p={1}
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              className="editableSheetContent"
            >
              {response?.response}
            </Markdown>
            {response?.error && (
              <>
                <Alert color="danger" sx={{ marginBottom: '1rem' }}>
                  Error{tryToDiagnoseRAGError(response?.error)}
                </Alert>
              </>
            )}

            <AccordionGroup
              size="sm"
              color="neutral"
              variant="soft"
              disableDivider
            >
              {response?.template && (
                <Accordion>
                  <AccordionSummary>Template</AccordionSummary>
                  <AccordionDetails>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {response?.template}
                    </pre>
                  </AccordionDetails>
                </Accordion>
              )}
              {response?.context && (
                <Accordion>
                  <AccordionSummary>Context</AccordionSummary>
                  <AccordionDetails>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {response?.context}
                    </pre>
                  </AccordionDetails>
                </Accordion>
              )}
              {response?.error && (
                <Accordion>
                  <AccordionSummary>Error Details</AccordionSummary>
                  <AccordionDetails>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {response?.error}
                    </pre>
                  </AccordionDetails>
                </Accordion>
              )}
            </AccordionGroup>
          </Box>
        </Box>
      </Box>
    </Sheet>
  );
}
