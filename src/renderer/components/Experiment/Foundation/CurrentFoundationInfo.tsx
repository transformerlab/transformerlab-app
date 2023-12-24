/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import { Button, IconButton, Stack, Typography } from '@mui/joy';
import { BabyIcon, DotIcon, Trash2Icon, XCircleIcon } from 'lucide-react';

import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ModelDetails from './ModelDetails';

const fetchWithPost = ({ url, post }) =>
  fetch(url, {
    method: 'POST',
    body: post,
  }).then((res) => res.json());

export default function CurrentFoundationInfo({
  experimentInfo,
  setFoundation,
  adaptor,
  setAdaptor,
}) {
  const { data: peftData } = useSWR(
    {
      url: chatAPI.Endpoints.Models.GetPeftsForModel(),
      post: experimentInfo?.config?.foundation,
    },
    fetchWithPost
  );

  return (
    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '20px',
      }}
    >
      <ModelDetails
        experimentInfo={experimentInfo}
        adaptor={adaptor}
        setAdaptor={setAdaptor}
        setFoundation={setFoundation}
      />

      <Typography level="title-lg" marginTop={4} marginBottom={1}>
        <BabyIcon size="1rem" />
        &nbsp;Available Adaptors:
      </Typography>
      <Stack
        direction="column"
        spacing={1}
        style={{ overflow: 'auto', height: '100%' }}
      >
        {peftData &&
          peftData.length === 0 &&
          'No Adaptors available for this model. Train one!'}
        {peftData &&
          peftData.map((peft) => (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'left',
                alignItems: 'center',
              }}
              key={peft}
            >
              <Typography level="title-md" paddingRight={3}>
                {peft}
                &nbsp;&nbsp;
              </Typography>
              <Button
                variant="soft"
                onClick={() => {
                  setAdaptor(peft);
                }}
              >
                Select
              </Button>
              <IconButton
                variant="plain"
                onClick={() => {
                  fetch(
                    chatAPI.Endpoints.Models.DeletePeft(
                      experimentInfo?.config?.foundation,
                      peft
                    )
                  );
                }}
              >
                <Trash2Icon />
              </IconButton>
            </div>
          ))}
      </Stack>
    </Sheet>
  );
}
