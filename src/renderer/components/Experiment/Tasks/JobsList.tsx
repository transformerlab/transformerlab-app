import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import MenuButton from '@mui/joy/MenuButton';
import Dropdown from '@mui/joy/Dropdown';
import {
  Trash2Icon,
  InfoIcon,
  LineChartIcon,
  WaypointsIcon,
  ArchiveIcon,
  MoreHorizontalIcon,
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
          <th style={{ minWidth: '400px', width: 'auto' }}>Actions</th>
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
              <td style={{ minWidth: '400px' }}>
                <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                  {/* Always show Output button */}
                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => onViewOutput?.(job?.id)}
                  >
                    Output
                  </Button>

                  {/* Collect all other available actions */}
                  {(() => {
                    const otherActions = [];

                    if (job?.job_data?.tensorboard_output_dir) {
                      otherActions.push({
                        label: 'Tensorboard',
                        icon: <LineChartIcon />,
                        onClick: () => onViewTensorboard?.(job?.id),
                      });
                    }

                    if (job?.job_data?.wandb_run_url) {
                      otherActions.push({
                        label: 'W&B Tracking',
                        icon: <LineChartIcon />,
                        onClick: () =>
                          window.open(job.job_data.wandb_run_url, '_blank'),
                      });
                    }

                    if (job?.job_data?.eval_images_dir) {
                      otherActions.push({
                        label: 'View Eval Images',
                        icon: null,
                        onClick: () => onViewEvalImages?.(job?.id),
                      });
                    }

                    if (job?.job_data?.sweep_output_file) {
                      otherActions.push({
                        label: 'Sweep Output',
                        icon: null,
                        onClick: () => onViewSweepOutput?.(job?.id),
                      });
                    }

                    if (job?.job_data?.checkpoints) {
                      otherActions.push({
                        label: 'Checkpoints',
                        icon: <WaypointsIcon />,
                        onClick: () => onViewCheckpoints?.(job?.id),
                      });
                    }

                    if (job?.job_data?.artifacts || job?.job_data?.artifacts_dir) {
                      otherActions.push({
                        label: 'Artifacts',
                        icon: <ArchiveIcon />,
                        onClick: () => onViewArtifacts?.(job?.id),
                      });
                    }

                    // Show ellipsis menu if there are any other actions
                    if (otherActions.length > 0) {
                      return (
                        <>
                          <Dropdown>
                            <MenuButton
                              slots={{ root: IconButton }}
                              slotProps={{ root: { variant: 'plain', size: 'sm' } }}
                            >
                              <MoreHorizontalIcon />
                            </MenuButton>
                            <Menu placement="bottom-end">
                              {otherActions.map((action, index) => (
                                <MenuItem
                                  key={`action-${index}`}
                                  onClick={action.onClick}
                                >
                                  {action.icon && (
                                    <span style={{ marginRight: '8px' }}>
                                      {action.icon}
                                    </span>
                                  )}
                                  {action.label}
                                </MenuItem>
                              ))}
                            </Menu>
                          </Dropdown>
                          <IconButton variant="plain">
                            <Trash2Icon
                              onClick={() => onDeleteJob?.(job.id)}
                              style={{ cursor: 'pointer' }}
                            />
                          </IconButton>
                        </>
                      );
                    }

                    // Show only delete button if no other actions
                    return (
                      <IconButton variant="plain">
                        <Trash2Icon
                          onClick={() => onDeleteJob?.(job.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </IconButton>
                    );
                  })()}
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
