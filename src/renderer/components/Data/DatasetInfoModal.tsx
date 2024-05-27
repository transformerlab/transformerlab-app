/* eslint-disable camelcase */
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
  CircularProgress,
  DialogContent,
  DialogTitle,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetInfoModal({ dataset_id, open, setOpen }) {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.Info(dataset_id),
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
        <DialogTitle>Dataset Info</DialogTitle>
        <DialogContent>
          {isLoading && <CircularProgress />}
          {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
