import useSWR from 'swr';

import { Button, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Editor } from '@monaco-editor/react';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ViewOutputModal({ jobId, setJobId }) {
  const { data, error, isLoading, mutate } = useSWR(
    jobId == -1 ? null : chatAPI.Endpoints.Experiment.GetOutputFromJob(jobId),
    fetcher
  );

  return (
    <Modal open={jobId != -1} onClose={() => setJobId(-1)}>
      <ModalDialog>
        <ModalClose />
        <Typography>Output from {jobId}</Typography>
        <Typography>
          <Editor
            height="80vh"
            width="80vw"
            defaultLanguage="text"
            options={{
              theme: 'vs-dark',
              minimap: {
                enabled: false,
              },
              fontSize: 18,
              cursorStyle: 'block',
              wordWrap: 'on',
            }}
            value={data}
          />
        </Typography>
        <Button
          onClick={() => {
            mutate();
          }}
        >
          Refresh
        </Button>
      </ModalDialog>
    </Modal>
  );
}
