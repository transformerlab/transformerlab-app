import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import Menu from '@mui/joy/Menu';
import MenuItem from '@mui/joy/MenuItem';
import MenuButton from '@mui/joy/MenuButton';
import Dropdown from '@mui/joy/Dropdown';
import { useTheme } from '@mui/joy/styles';
import useMediaQuery from '@mui/system/useMediaQuery';
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

// Simple responsive action buttons component
const ResponsiveActionButtons: React.FC<{
  job: any;
  onDeleteJob?: (jobId: string) => void;
  onViewOutput?: (jobId: string) => void;
  onViewTensorboard?: (jobId: string) => void;
  onViewCheckpoints?: (jobId: string) => void;
  onViewArtifacts?: (jobId: string) => void;
  onViewEvalImages?: (jobId: string) => void;
  onViewSweepOutput?: (jobId: string) => void;
}> = ({
  job,
  onDeleteJob,
  onViewOutput,
  onViewTensorboard,
  onViewCheckpoints,
  onViewArtifacts,
  onViewEvalImages,
  onViewSweepOutput,
}) => {
  // Collect all available actions, prioritizing common ones
  const commonActions = []; // W&B, Artifacts, Checkpoints - show these first
  const rareActions = []; // Tensorboard - put in ellipsis

  // Common actions (prioritize these)
  if (job?.job_data?.wandb_run_url) {
    commonActions.push({
      label: 'W&B Tracking',
      icon: <LineChartIcon />,
      onClick: () => window.open(job.job_data.wandb_run_url, '_blank'),
    });
  }

  if (job?.job_data?.artifacts || job?.job_data?.artifacts_dir) {
    commonActions.push({
      label: 'Artifacts',
      icon: <ArchiveIcon />,
      onClick: () => onViewArtifacts?.(job?.id),
    });
  }

  if (job?.job_data?.checkpoints) {
    commonActions.push({
      label: 'Checkpoints',
      icon: <WaypointsIcon />,
      onClick: () => onViewCheckpoints?.(job?.id),
    });
  }

  if (job?.job_data?.eval_images_dir) {
    commonActions.push({
      label: 'View Eval Images',
      icon: null,
      onClick: () => onViewEvalImages?.(job?.id),
    });
  }

  if (job?.job_data?.sweep_output_file) {
    commonActions.push({
      label: 'Sweep Output',
      icon: null,
      onClick: () => onViewSweepOutput?.(job?.id),
    });
  }

  // Rare actions (put these in ellipsis)
  if (job?.job_data?.tensorboard_output_dir) {
    rareActions.push({
      label: 'Tensorboard',
      icon: <LineChartIcon />,
      onClick: () => onViewTensorboard?.(job?.id),
    });
  }

  // Combine actions: common first, then rare
  const allActions = [...commonActions, ...rareActions];

  // Use breakpoints to determine how many buttons to show
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md')); // < 960px
  const isMediumScreen = useMediaQuery(theme.breakpoints.down('lg')); // < 1200px

  // Determine how many actions to show based on screen size
  let maxVisibleActions = allActions.length;

  if (isSmallScreen) {
    // Small screens: show max 1 action + ellipsis
    maxVisibleActions = 1;
  } else if (isMediumScreen) {
    // Medium screens: show max 2 actions + ellipsis
    maxVisibleActions = 2;
  } else {
    // Large screens: show max 3 actions + ellipsis
    maxVisibleActions = 3;
  }

  const showEllipsis = allActions.length > maxVisibleActions;
  const visibleActions = showEllipsis ? allActions.slice(0, maxVisibleActions) : allActions;
  const hiddenActions = showEllipsis ? allActions.slice(maxVisibleActions) : [];

  return (
    <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
      {/* Always show Output button */}
      <Button size="sm" variant="plain" onClick={() => onViewOutput?.(job?.id)}>
        Output
      </Button>

      {/* Show visible actions as buttons */}
      {visibleActions.map((action, index) => (
        <Button
          key={`visible-${index}`}
          size="sm"
          variant="plain"
          onClick={action.onClick}
          startDecorator={action.icon}
        >
          {action.label}
        </Button>
      ))}

      {/* Show ellipsis menu if there are hidden actions */}
      {hiddenActions.length > 0 && (
        <Dropdown>
          <MenuButton
            slots={{ root: IconButton }}
            slotProps={{
              root: { variant: 'plain', size: 'sm' },
            }}
          >
            <MoreHorizontalIcon />
          </MenuButton>
          <Menu placement="bottom-end">
            {hiddenActions.map((action, index) => (
              <MenuItem key={`hidden-${index}`} onClick={action.onClick}>
                {action.icon && (
                  <span style={{ marginRight: '8px' }}>{action.icon}</span>
                )}
                {action.label}
              </MenuItem>
            ))}
          </Menu>
        </Dropdown>
      )}

      {/* Always show Delete button */}
      <IconButton variant="plain">
        <Trash2Icon
          onClick={() => onDeleteJob?.(job.id)}
          style={{ cursor: 'pointer' }}
        />
      </IconButton>
    </ButtonGroup>
  );
};

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
                <ResponsiveActionButtons
                  job={job}
                  onDeleteJob={onDeleteJob}
                  onViewOutput={onViewOutput}
                  onViewTensorboard={onViewTensorboard}
                  onViewCheckpoints={onViewCheckpoints}
                  onViewArtifacts={onViewArtifacts}
                  onViewEvalImages={onViewEvalImages}
                  onViewSweepOutput={onViewSweepOutput}
                />
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
