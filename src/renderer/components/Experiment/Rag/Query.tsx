/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';

import Sheet from '@mui/joy/Sheet';

import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
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
  const [response, setResponse] = React.useState('Response');

  const getResponse = () => {
    setResponse('Response from the server');
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
              endDecorator={
                <SendHorizonalIcon
                  onClick={() => {
                    getResponse();
                  }}
                />
              }
            />
            {/* <FormHelperText>This is a helper text.</FormHelperText> */}
          </FormControl>
          <Box my={2} sx={{ border: '2px solid pink' }} p={2}>
            {response}
          </Box>
        </Box>
      </Box>
    </Sheet>
  );
}
