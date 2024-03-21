/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  LinearProgress,
  Typography,
} from '@mui/joy';
import {
  ArrowBigRight,
  ArrowBigRightIcon,
  ExternalLinkIcon,
  SendHorizonalIcon,
} from 'lucide-react';
import Documents from './Documents';

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
          {isLoading && <LinearProgress />}
          {response != '' && (
            <Box
              mt={6}
              sx={{ borderLeft: '2px solid var(--joy-palette-neutral-500)' }}
              p={2}
            >
              {response}
            </Box>
          )}
        </Box>
      </Box>
    </Sheet>
  );
}
