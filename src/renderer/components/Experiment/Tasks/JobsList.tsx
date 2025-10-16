import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import {
  Trash2Icon,
  InfoIcon,
  LineChartIcon,
  WaypointsIcon,
  ArchiveIcon,
} from 'lucide-react';
import JobProgress from './JobProgress';

interface JobsListProps {
  jobs: any[];
  onDeleteJob?: (jobId: string) => void;
  onViewOutput?: (jobId: string) => void;
  onViewTensorboard?: (jobId: string) => void;
  onViewCheckpoints?: (jobId: string) => void;
  onViewArtifacts?: (jobId: string) => void;
  onViewEvalImages?: (jobId: string) => void;
  onViewSweepOutput?: (jobId: string) => void;
}

const JobsList: React.FC<JobsListProps> = ({
  jobs,
  onDeleteJob,
  onViewOutput,
  onViewTensorboard,
  onViewCheckpoints,
  onViewArtifacts,
  onViewEvalImages,
  onViewSweepOutput,
}) => {
  const formatJobConfig = (job: any) => {
    // For jobs with template name, show template info
    if (job.job_data?.template_name) {
      return (
        <>
          <b>Template:</b> {job.job_data.template_name}
          <br />
          <b>Type:</b> {job.type || 'Unknown'}
        </>
      );
    }

    return <b>{job.type || 'Unknown Job'}</b>;
  };

  return (
    <Table>
      <thead>
        <tr>
          <th style={{ width: '60px' }}>ID</th>
          <th>Details</th>
          <th>Status</th>
          <th style={{ width: '400px' }}></th>
        </tr>
      </thead>
      <tbody style={{ overflow: 'auto', height: '100%' }}>
        {jobs?.length > 0 ? (
          jobs?.map((job) => (
            <tr key={job.id}>
              <td>
                <b>{job.id}</b>
                <br />
                <InfoIcon
                  onClick={() => {
                    const jobDataConfig = job?.job_data;
                    if (typeof jobDataConfig === 'object') {
                      alert(JSON.stringify(jobDataConfig, null, 2));
                    } else {
                      alert(jobDataConfig);
                    }
                  }}
                  size="16px"
                  color="var(--joy-palette-neutral-500)"
                  style={{ cursor: 'pointer' }}
                />
              </td>
              <td>{formatJobConfig(job)}</td>
              <td>
                <JobProgress job={job} />
              </td>
              <td style={{}}>
                <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                  {job?.job_data?.tensorboard_output_dir && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewTensorboard?.(job?.id)}
                      startDecorator={<LineChartIcon />}
                    >
                      Tensorboard
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => onViewOutput?.(job?.id)}
                  >
                    Output
                  </Button>
                  {job?.job_data?.eval_images_dir && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewEvalImages?.(job?.id)}
                    >
                      View Eval Images
                    </Button>
                  )}
                  {job?.job_data?.sweep_output_file && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewSweepOutput?.(job?.id)}
                    >
                      Sweep Output
                    </Button>
                  )}
                  {job?.job_data?.checkpoints && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewCheckpoints?.(job?.id)}
                      startDecorator={<WaypointsIcon />}
                    >
                      Checkpoints
                    </Button>
                  )}
                  {(job?.job_data?.artifacts ||
                    job?.job_data?.artifacts_dir) && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewArtifacts?.(job?.id)}
                      startDecorator={<ArchiveIcon />}
                    >
                      Artifacts
                    </Button>
                  )}
                  <IconButton variant="plain">
                    <Trash2Icon
                      onClick={() => onDeleteJob?.(job.id)}
                      style={{ cursor: 'pointer' }}
                    />
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
