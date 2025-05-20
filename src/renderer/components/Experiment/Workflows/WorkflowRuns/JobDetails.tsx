import { useState } from 'react';
import { Modal, Box, Typography, Sheet, ModalClose, Table } from '@mui/joy';
import * as chatAPI from '../../../../lib/transformerlab-api-sdk';

import useSWR from 'swr';
import OutputTerminal from 'renderer/components/OutputTerminal';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function JobDetails({ jobId, onClose }) {
  const [open, setOpen] = useState(true);

  const { data } = useSWR(chatAPI.Endpoints.Jobs.Get(jobId), fetcher);

  return (
    <Modal
      open={jobId !== null}
      onClose={onClose}
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <Sheet
        variant="outlined"
        sx={{
          minWidth: 300,
          maxWidth: '70vw',
          borderRadius: 'md',
          p: 3,
          boxShadow: 'lg',
        }}
      >
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <Typography
          component="h2"
          id="modal-title"
          level="h4"
          textColor="inherit"
          sx={{ fontWeight: 'lg', mb: 1 }}
        >
          Job {jobId}
        </Typography>
        {data ? (
          <Box>
            <Table aria-label="job details table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Job ID</td>
                  <td>{data?.id}</td>
                </tr>
                <tr>
                  <td>Status</td>
                  <td>{data?.status}</td>
                </tr>
                <tr>
                  <td>Type</td>
                  <td>{data?.type}</td>
                </tr>
                <tr>
                  <td>Progress</td>
                  <td>{data?.progress}%</td>
                </tr>
                <tr>
                  <td>Start Time</td>
                  <td>{data?.job_data?.start_time}</td>
                </tr>
                <tr>
                  <td>End Time</td>
                  <td>{data?.job_data?.end_time}</td>
                </tr>
                <tr>
                  <td>Evaluator</td>
                  <td>{data?.job_data?.evaluator}</td>
                </tr>
                <tr>
                  <td>Model Name</td>
                  <td>{data?.job_data?.model_name}</td>
                </tr>
                <tr>
                  <td>Score</td>
                  <td>
                    {JSON.parse(data?.job_data?.score || '[]')
                      .map((score) => `${score.type}: ${score.score}`)
                      .join(', ')}
                  </td>
                </tr>
                <tr>
                  <td>Completion Status</td>
                  <td>{data?.job_data?.completion_status}</td>
                </tr>
                <tr>
                  <td>Completion Details</td>
                  <td>{data?.job_data?.completion_details}</td>
                </tr>
              </tbody>
            </Table>
            <OutputTerminal
              logEndpoint={chatAPI.Endpoints.Experiment.StreamOutputFromJob(
                data?.id,
              )}
              lineAnimationDelay={1}
            />
          </Box>
        ) : (
          <Typography>Loading...</Typography>
        )}
      </Sheet>
    </Modal>
  );
}
