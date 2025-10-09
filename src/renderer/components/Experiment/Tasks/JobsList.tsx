import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import { Trash2Icon } from 'lucide-react';
import JobProgress from './JobProgress';

interface JobsListProps {
  jobs: any[];
  onDeleteJob?: (jobId: string) => void;
}

const JobsList: React.FC<JobsListProps> = ({ jobs, onDeleteJob }) => {
  const getJobDetails = (job: any) => {
    // Check if this is a remote task
    if (job.job_data?.remote_task) {
      return (
        <div>
          Instance: {job.job_data.cluster_name || 'N/A'}
          {job.job_data.accelerators && (
            <>
              <br />
              Accelerators: {job.job_data.accelerators}
            </>
          )}
        </div>
      );
    }

    // For regular jobs, show template name or job type
    if (job.job_data?.template_name) {
      return (
        <div>
          <strong>{job.job_data.template_name}</strong>
          <br />
          Type: {job.type || 'Unknown'}
        </div>
      );
    }

    return (
      <div>
        <strong>{job.type || 'Unknown Job'}</strong>
      </div>
    );
  };

  return (
    <Table>
      <thead>
        <tr>
          <th style={{ width: '60px' }}>ID</th>
          <th>Details</th>
          <th>Status</th>
          <th style={{ width: '400px' }}>Other</th>
        </tr>
      </thead>
      <tbody style={{ overflow: 'auto', height: '100%' }}>
        {jobs?.length > 0 ? (
          jobs?.map((job) => (
            <tr key={job.id}>
              <td>
                <b>{job.id}</b>
              </td>
              <td>{getJobDetails(job)}</td>
              <td>
                <JobProgress job={job} />
              </td>
              <td>
                <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                  <IconButton 
                    variant="plain" 
                    color="danger"
                    onClick={() => onDeleteJob?.(job.id)}
                    title="Delete job"
                  >
                    <Trash2Icon style={{ cursor: 'pointer' }} />
                  </IconButton>
                </ButtonGroup>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
              No jobs found
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
};

export default JobsList;
