/**
 * ExportDetailsModal.tsx - a simple modal that shows full JSON for an export job
 */
import useSWR from 'swr';

import { Button, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { Editor } from '@monaco-editor/react';

const fetcher = (url) => fetch(url).then((res) => res.json());

// convert JSON data in to a more readable format
function formatJobData(data) {
    let json_data = JSON.stringify(data, undefined, 4);
    return json_data;
}

export default function ExportDetailsModal({ jobId, setJobId }) {

  // TODO: Pass in experiment ID!
  const { data, error, isLoading, mutate } = useSWR(
    (jobId == -1) ? null : chatAPI.Endpoints.Experiment.GetExportJobDetails(1, jobId),
    fetcher
  );

  return (
    <Modal open={jobId != -1} onClose={() => setJobId(-1)}>
      <ModalDialog>
        <ModalClose />
        <Typography>Output from Job {jobId}</Typography>
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
            value={formatJobData(data)}
          />
        </Typography>
      </ModalDialog>
    </Modal>
  );
}