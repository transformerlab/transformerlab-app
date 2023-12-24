/* eslint-disable camelcase */
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';

import {
  Button,
  Divider,
  Table,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PreviewDatasetModal({ dataset_id, open, setOpen }) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.Preview(dataset_id),
    fetcher
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
    >
      <ModalDialog>
        <ModalClose />
        <Typography level="h5">
          Preview <b>{dataset_id}</b>
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Sheet
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'scroll',
          }}
        >
          <Table sx={{ tableLayout: 'auto' }}>
            <thead>
              <tr>{data && Object.keys(data[0]).map((k) => <th>{k}</th>)}</tr>
            </thead>
            <tbody>
              {data &&
                data.map((row) => {
                  const values = Object.values(row);
                  return (
                    <tr>
                      {values.map((v) => (
                        <td
                          style={{
                            whiteSpace: 'pre-line',
                            verticalAlign: 'top',
                          }}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
