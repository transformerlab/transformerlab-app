import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import Skeleton from '@mui/joy/Skeleton';
import Box from '@mui/joy/Box';
import {
  Trash2Icon,
  LineChartIcon,
  WaypointsIcon,
  ArchiveIcon,
  LogsIcon,
  FileTextIcon,
  DatabaseIcon,
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
  onViewSweepResults?: (jobId: string) => void;
  onViewEvalResults?: (jobId: string) => void;
  onViewGeneratedDataset?: (jobId: string, datasetId: string) => void;
  onViewInteractive?: (jobId: string) => void;
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
  onViewSweepResults,
  onViewEvalResults,
  onViewGeneratedDataset,
  onViewInteractive,
}) => {
  const formatJobConfig = (job: any) => {
    const jobData = job?.job_data || {};

    // Handle sweep child jobs
    if (jobData?.parent_sweep_job_id) {
      const runIndex = jobData.sweep_run_index || 0;
      const total = jobData.sweep_total || 0;
      const sweepParams = jobData.sweep_params || {};
      const paramStr = Object.entries(sweepParams)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return (
        <>
          <b>
            Sweep Run {runIndex}/{total}
          </b>
          {paramStr && (
            <>
              <br />
              <small>{paramStr}</small>
            </>
          )}
        </>
      );
    }

    // Handle sweep parent jobs
    if (jobData?.sweep_parent || job?.type === 'SWEEP') {
      const total = jobData.sweep_total || 0;
      const sweepConfig = jobData.sweep_config || {};
      const configStr = Object.keys(sweepConfig).join(' × ');
      return (
        <>
          <b>Sweep: {total} configurations</b>
          {configStr && (
            <>
              <br />
              <small>{configStr}</small>
            </>
          )}
        </>
      );
    }

    // Prefer showing Cluster Name (if present) and the user identifier (name/email)
    const clusterName = jobData?.cluster_name;

    const userInfo = jobData.user_info || {};
    const userDisplay = userInfo.name || userInfo.email || '';

    if (job?.placeholder) {
      return (
        <>
          <Skeleton variant="text" level="body-md" width={160} />
          <Skeleton variant="text" level="body-sm" width={100} />
        </>
      );
    }
    // Build preferred details
    if (clusterName || userDisplay) {
      return (
        <>
          {clusterName && (
            <>
              <b>Instance:</b> {clusterName}
              <br />
            </>
          )}
          {userDisplay && (
            <>
              <b>Launched by:</b> {userDisplay}
            </>
          )}
        </>
      );
    }

    // Fallbacks to existing info when no cluster/user available
    if (jobData?.template_name) {
      return (
        <>
          <b>Template:</b> {jobData.template_name}
          <br />
          <b>Type:</b> {job.type || 'Unknown'}
        </>
      );
    }

    return <b>{job.type || 'Unknown Job'}</b>;
  };

  return (
    <Table style={{ tableLayout: 'auto' }} stickyHeader>
      <thead>
        <tr>
          <th style={{ width: '60px' }}>ID</th>
          <th>Details</th>
          <th>Status</th>
          <th style={{ textAlign: 'right', width: '320px' }}>Actions</th>
        </tr>
      </thead>
      <tbody style={{ overflow: 'auto', height: '100%' }}>
        {jobs?.length > 0 ? (
          jobs?.map((job) => (
            <tr key={job.id}>
              <td>
                <b>{job.id}</b>
              </td>
              <td>{formatJobConfig(job)}</td>
              <td>
                <JobProgress job={job} />
              </td>
              <td style={{ width: 'fit-content' }}>
                <ButtonGroup
                  sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
                >
                  {job?.placeholder && (
                    <Skeleton variant="rectangular" width={100} height={28} />
                  )}
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

                  {job?.job_data?.wandb_run_url && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => {
                        window.open(job.job_data.wandb_run_url, '_blank');
                      }}
                      startDecorator={<LineChartIcon />}
                    >
                      <Box
                        sx={{
                          display: {
                            xs: 'none',
                            sm: 'none',
                            md: 'inline-flex',
                          },
                        }}
                      >
                        W&B Tracking
                      </Box>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => onViewOutput?.(job?.id)}
                    startDecorator={<LogsIcon />}
                  >
                    <Box
                      sx={{
                        display: {
                          xs: 'none',
                          sm: 'none',
                          md: 'inline-flex',
                        },
                      }}
                    >
                      Output
                    </Box>
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
                  {job?.job_data?.eval_results &&
                    Array.isArray(job.job_data.eval_results) &&
                    job.job_data.eval_results.length > 0 && (
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => onViewEvalResults?.(job?.id)}
                        startDecorator={<FileTextIcon />}
                      >
                        <Box
                          sx={{
                            display: {
                              xs: 'none',
                              sm: 'none',
                              md: 'inline-flex',
                            },
                          }}
                        >
                          Eval Results
                        </Box>
                      </Button>
                    )}
                  {job?.job_data?.generated_datasets &&
                    Array.isArray(job.job_data.generated_datasets) &&
                    job.job_data.generated_datasets.length > 0 && (
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => {
                          // Show the first dataset, or could show a selector if multiple
                          const firstDataset =
                            job.job_data.generated_datasets[0];
                          onViewGeneratedDataset?.(job?.id, firstDataset);
                        }}
                        startDecorator={<DatabaseIcon />}
                      >
                        <Box
                          sx={{
                            display: {
                              xs: 'none',
                              sm: 'none',
                              md: 'inline-flex',
                            },
                          }}
                        >
                          Preview Dataset
                        </Box>
                      </Button>
                    )}
                  {(job?.type === 'SWEEP' || job?.job_data?.sweep_parent) &&
                    job?.status === 'COMPLETE' && (
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => onViewSweepResults?.(job?.id)}
                        startDecorator={<LineChartIcon />}
                      >
                        <Box
                          sx={{
                            display: {
                              xs: 'none',
                              sm: 'none',
                              md: 'inline-flex',
                            },
                          }}
                        >
                          Sweep Results
                        </Box>
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
                  {job?.status === 'INTERACTIVE' &&
                    (job?.job_data?.interactive_type === 'vscode' ||
                      job?.job_data?.interactive_type === 'jupyter' ||
                      job?.job_data?.interactive_type === 'vllm' ||
                      job?.job_data?.interactive_type === 'ollama' ||
                      job?.job_data?.interactive_type === 'ssh') && (
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => onViewInteractive?.(job?.id)}
                      >
                        Interactive Setup
                      </Button>
                    )}
                  {job?.job_data?.checkpoints && (
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => onViewCheckpoints?.(job?.id)}
                      startDecorator={<WaypointsIcon />}
                      sx={{
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          display: {
                            xs: 'none',
                            sm: 'none',
                            md: 'inline-flex',
                          },
                        }}
                      >
                        Checkpoints
                      </Box>
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
                      <Box
                        sx={{
                          display: {
                            xs: 'none',
                            sm: 'none',
                            md: 'inline-flex',
                          },
                        }}
                      >
                        Artifacts
                      </Box>
                    </Button>
                  )}
                  {!job?.placeholder && (
                    <IconButton variant="plain">
                      <Trash2Icon
                        onClick={() => onDeleteJob?.(job.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </IconButton>
                  )}
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
