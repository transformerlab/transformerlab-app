import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
  Modal,
  ModalDialog,
  ModalClose,
  Table,
  Divider,
} from '@mui/joy';
import {
  Play,
  StopCircle,
  Eye,
  Activity,
  Server,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { DistributedJobStatus } from 'renderer/types/distributed';

interface DistributedJobMonitorProps {
  job: any; // Regular job object
  distributedStatus?: DistributedJobStatus;
  onStopJob: (jobId: string) => void;
  onViewLogs: (jobId: string) => void;
}

export default function DistributedJobMonitor({
  job,
  distributedStatus,
  onStopJob,
  onViewLogs,
}: DistributedJobMonitorProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nodeStates, setNodeStates] = useState<Record<string, any>>({});

  // Poll for distributed job status if it's a distributed job
  useEffect(() => {
    if (job?.is_distributed && job?.distributed_job_id) {
      const pollStatus = async () => {
        try {
          const response = await fetch(
            `/api/network/distributed/status/${job.distributed_job_id}`,
          );
          const status = await response.json();
          setNodeStates(status);
        } catch (error) {
          // Handle error silently
        }
      };

      const interval = setInterval(pollStatus, 5000);
      pollStatus(); // Initial call

      return () => clearInterval(interval);
    }
  }, [job?.is_distributed, job?.distributed_job_id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'primary';
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'planning':
      case 'dispatching':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play size={16} />;
      case 'completed':
        return <CheckCircle size={16} />;
      case 'failed':
        return <AlertCircle size={16} />;
      case 'planning':
      case 'dispatching':
        return <Clock size={16} />;
      default:
        return <Activity size={16} />;
    }
  };

  const getOverallProgress = () => {
    if (!distributedStatus?.nodes) return 0;

    const completedNodes = distributedStatus.nodes.filter(
      (node) => node.status === 'completed',
    ).length;
    return (completedNodes / distributedStatus.nodes.length) * 100;
  };

  const getRunningNodes = () => {
    return (
      distributedStatus?.nodes?.filter((node) => node.status === 'running')
        .length || 0
    );
  };

  const getCompletedNodes = () => {
    return (
      distributedStatus?.nodes?.filter((node) => node.status === 'completed')
        .length || 0
    );
  };

  const getFailedNodes = () => {
    return (
      distributedStatus?.nodes?.filter((node) => node.status === 'failed')
        .length || 0
    );
  };

  if (!job?.is_distributed) {
    return null; // Don't render for non-distributed jobs
  }

  return (
    <>
      <Card
        variant="outlined"
        sx={{
          border: '2px solid',
          borderColor: `${getStatusColor(distributedStatus?.status || 'unknown')}.200`,
          '&:hover': {
            borderColor: `${getStatusColor(distributedStatus?.status || 'unknown')}.400`,
          },
        }}
      >
        <CardContent>
          <Stack spacing={2}>
            {/* Header */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography
                level="title-md"
                startDecorator={<Server size={18} />}
              >
                Distributed Job #{job.id}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  size="sm"
                  color={getStatusColor(distributedStatus?.status || 'unknown')}
                  startDecorator={getStatusIcon(
                    distributedStatus?.status || 'unknown',
                  )}
                >
                  {distributedStatus?.status || 'Unknown'}
                </Chip>
                <Chip size="sm" variant="soft">
                  {distributedStatus?.world_size || 0} nodes
                </Chip>
              </Stack>
            </Box>

            {/* Progress */}
            {distributedStatus && (
              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mb: 1,
                  }}
                >
                  <Typography level="body-sm">Overall Progress</Typography>
                  <Typography level="body-sm">
                    {getCompletedNodes()}/{distributedStatus.nodes.length} nodes
                  </Typography>
                </Box>
                <LinearProgress
                  determinate
                  value={getOverallProgress()}
                  color={getStatusColor(distributedStatus.status)}
                  sx={{ mb: 1 }}
                />
                <Stack direction="row" spacing={2}>
                  <Typography level="body-xs" color="primary">
                    Running: {getRunningNodes()}
                  </Typography>
                  <Typography level="body-xs" color="success">
                    Completed: {getCompletedNodes()}
                  </Typography>
                  {getFailedNodes() > 0 && (
                    <Typography level="body-xs" color="danger">
                      Failed: {getFailedNodes()}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}

            {/* Node Summary */}
            {distributedStatus?.nodes && (
              <Box>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Nodes Status:
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ flexWrap: 'wrap', gap: 1 }}
                >
                  {distributedStatus.nodes.map((node) => (
                    <Chip
                      key={node.machine_id}
                      size="sm"
                      color={getStatusColor(node.status)}
                      variant="soft"
                    >
                      {node.machine_id} (Rank {node.rank})
                    </Chip>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Actions */}
            <Stack direction="row" spacing={1}>
              <Button
                size="sm"
                variant="outlined"
                startDecorator={<Eye size={16} />}
                onClick={() => setDetailsOpen(true)}
              >
                Details
              </Button>
              <Button
                size="sm"
                variant="outlined"
                onClick={() => onViewLogs(job.id)}
              >
                Logs
              </Button>
              {distributedStatus?.status === 'running' && (
                <Button
                  size="sm"
                  color="danger"
                  variant="outlined"
                  startDecorator={<StopCircle size={16} />}
                  onClick={() => onStopJob(job.distributed_job_id)}
                >
                  Stop All
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)}>
        <ModalDialog sx={{ maxWidth: '800px', width: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Distributed Job Details
          </Typography>

          <Stack spacing={3}>
            {/* Job Info */}
            <Box>
              <Typography level="title-sm" sx={{ mb: 1 }}>
                Job Information
              </Typography>
              <Stack spacing={1}>
                <Typography level="body-sm">
                  <strong>Job ID:</strong> {job.id}
                </Typography>
                <Typography level="body-sm">
                  <strong>Distributed Job ID:</strong> {job.distributed_job_id}
                </Typography>
                <Typography level="body-sm">
                  <strong>Status:</strong> {distributedStatus?.status}
                </Typography>
                <Typography level="body-sm">
                  <strong>World Size:</strong> {distributedStatus?.world_size}
                </Typography>
                {distributedStatus?.master_addr && (
                  <Typography level="body-sm">
                    <strong>Master Address:</strong>{' '}
                    {distributedStatus.master_addr}:
                    {distributedStatus.master_port}
                  </Typography>
                )}
              </Stack>
            </Box>

            <Divider />

            {/* Node Details */}
            {distributedStatus?.nodes && (
              <Box>
                <Typography level="title-sm" sx={{ mb: 2 }}>
                  Node Details
                </Typography>
                <Table>
                  <thead>
                    <tr>
                      <th>Machine ID</th>
                      <th>Rank</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Start Time</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributedStatus.nodes.map((node) => (
                      <tr key={node.machine_id}>
                        <td>{node.machine_id}</td>
                        <td>{node.rank}</td>
                        <td>
                          <Chip
                            size="sm"
                            color={getStatusColor(node.status)}
                            variant="soft"
                          >
                            {node.status}
                          </Chip>
                        </td>
                        <td>
                          {node.progress !== undefined
                            ? `${node.progress}%`
                            : '-'}
                        </td>
                        <td>
                          {node.start_time
                            ? new Date(node.start_time).toLocaleString()
                            : '-'}
                        </td>
                        <td>
                          {node.start_time && node.end_time
                            ? `${Math.round(
                                (new Date(node.end_time).getTime() -
                                  new Date(node.start_time).getTime()) /
                                  1000,
                              )}s`
                            : node.start_time && !node.end_time
                              ? `${Math.round(
                                  (Date.now() -
                                    new Date(node.start_time).getTime()) /
                                    1000,
                                )}s`
                              : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Box>
            )}
          </Stack>
        </ModalDialog>
      </Modal>
    </>
  );
}
