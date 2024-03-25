/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import { Box, FormControl, FormLabel, Input, LinearProgress } from '@mui/joy';
import { SendHorizonalIcon } from 'lucide-react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Query({ experimentInfo }) {
  const [response, setResponse] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const getResponse = async (query: string) => {
    setIsLoading(true);
    setResponse('');
    const response = await fetch(
      chatAPI.Endpoints.Rag.Query(
        experimentInfo.id,
        experimentInfo?.config?.foundation,
        query
      )
    );
    const data = await response.json();
    console.log(data);
    setIsLoading(false);
    setResponse(data);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        justifyContent: 'space-between',
        marginBottom: '2rem',
      }}
    >
      <Box sx={{ flex: 3 }}>
        <Box sx={{ padding: '1rem' }}>
          <FormControl>
            <FormLabel>Your question:</FormLabel>
            <Input
              placeholder="What are the top six reasons for suffering?"
              name="query"
              endDecorator={
                <SendHorizonalIcon
                  onClick={() => {
                    const query = document.getElementsByName('query')[0].value;
                    getResponse(query);
                  }}
                />
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const query = document.getElementsByName('query')[0].value;
                  getResponse(query);
                }
              }}
            />
            {/* <FormHelperText>This is a helper text.</FormHelperText> */}
          </FormControl>
          {isLoading && <LinearProgress size="sm" />}
          {response != '' && (
            <Box
              mt={6}
              sx={{ borderLeft: '2px solid var(--joy-palette-neutral-500)' }}
              p={2}
            >
              <Markdown
                remarkPlugins={[remarkGfm]}
                className="editableSheetContent"
              >
                {response}
              </Markdown>
            </Box>
          )}
        </Box>
      </Box>
    </Sheet>
  );
}
