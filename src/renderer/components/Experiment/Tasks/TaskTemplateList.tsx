import React, { useState, useEffect } from 'react';
import {
  Table,
  ButtonGroup,
  Typography,
  IconButton,
  Button,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  CircularProgress,
  Chip,
} from '@mui/joy';
import { PlayIcon, Trash2Icon, ServerIcon } from 'lucide-react';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { parseResourcesString } from './ResourceStringParser';

type TaskRow = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  datasets?: any;
  config: string | object;
  created?: string;
  updated?: string;
  remote_task?: boolean;
};

type TaskTemplateListProps = {
  tasksList: TaskRow[];
  onDeleteTask: (taskId: string) => void;
  onQueueTask: (task: TaskRow) => void;
  onEditTask: (task: TaskRow) => void;
};

const TaskTemplateList: React.FC<TaskTemplateListProps> = ({
  tasksList,
  onDeleteTask,
  onQueueTask,
  onEditTask,
}) => {
  const [instances, setInstances] = useState<any[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);

  // Fetch instances from the GPU orchestrator
  useEffect(() => {
    const fetchInstances = async () => {
      setLoadingInstances(true);
      try {
        const response = await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Jobs.GetInstancesStatus(),
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.data?.clusters) {
            setInstances(data.data.clusters);
          } else {
            setInstances([]);
          }
        } else {
          setInstances([]);
        }
      } catch (error) {
        console.error('Failed to fetch instances:', error);
        setInstances([]);
      } finally {
        setLoadingInstances(false);
      }
    };

    fetchInstances();
  }, []);

  const getResourcesInfo = (task: TaskRow) => {
    if (!task.remote_task) {
      return 'N/A';
    }

    const config =
      (typeof task.config === 'string'
        ? SafeJSONParse(task.config as string, {})
        : (task.config as any)) || {};

    // Debug: verify parsed config shape
    // eslint-disable-next-line no-console
    console.debug('Task resources config', { id: task.id, config });
    const resources = [];

    if (config.cpus) resources.push(`CPUs: ${config.cpus}`);
    if (config.memory) resources.push(`Memory: ${config.memory}`);
    if (config.disk_space) resources.push(`Disk: ${config.disk_space}`);
    if (config.accelerators)
      resources.push(`Accelerators: ${config.accelerators}`);
    if (config.num_nodes) resources.push(`Nodes: ${config.num_nodes}`);

    return resources.length > 0
      ? resources.join(', ')
      : 'No resources specified';
  };

  const getCommandInfo = (task: TaskRow) => {
    if (!task.remote_task) {
      return 'N/A';
    }

    const config =
      (typeof task.config === 'string'
        ? SafeJSONParse(task.config as string, {})
        : (task.config as any)) || {};
    const command = config.command || 'No command specified';

    // Truncate long commands
    return command.length > 50 ? `${command.substring(0, 50)}...` : command;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UP':
        return 'success';
      case 'INIT':
        return 'warning';
      case 'STOPPED':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const handleInstanceSelect = (instance: any) => {
    // For now, do nothing when an instance is selected
    console.log('Selected instance:', instance);
  };

  return (
    <Table stickyHeader>
      <thead>
        <tr>
          <th style={{ width: '150px' }}>Name</th>
          <th>Command</th>
          <th>Resources</th>
          <th style={{ textAlign: 'right', width: '320px' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tasksList.map((row) => (
          <tr key={row.id}>
            <td>
              <Typography level="title-sm" sx={{ overflow: 'clip' }}>
                {row.name}
              </Typography>
            </td>
            <td style={{ overflow: 'clip' }}>
              <Typography level="body-sm">{getCommandInfo(row)}</Typography>
            </td>
            <td style={{ overflow: 'hidden' }}>
              <Typography level="body-sm">{getResourcesInfo(row)}</Typography>
            </td>
            <td
              style={{
                overflow: 'visible',
              }}
            >
              <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                <Button
                  startDecorator={<PlayIcon />}
                  variant="soft"
                  color="success"
                  onClick={() => onQueueTask?.(row)}
                >
                  Queue
                </Button>
                <Dropdown>
                  <MenuButton
                    variant="outlined"
                    color="primary"
                    startDecorator={<ServerIcon />}
                    loading={loadingInstances}
                  >
                    Use Existing
                  </MenuButton>
                  <Menu sx={{ maxHeight: 400, overflow: 'auto', minWidth: 300 }}>
                    {instances.length === 0 ? (
                      <MenuItem disabled>
                        <Typography level="body-sm">
                          No instances available
                        </Typography>
                      </MenuItem>
                    ) : (
                      instances.map((instance) => {
                        const parsed = parseResourcesString(instance.resources_str || '');
                        return (
                          <MenuItem
                            key={instance.cluster_name}
                            onClick={() => handleInstanceSelect(instance)}
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              py: 1.5,
                              gap: 1,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                width: '100%',
                                alignItems: 'center',
                              }}
                            >
                              <Typography level="title-sm">
                                {instance.cluster_name}
                              </Typography>
                              <Chip
                                size="sm"
                                color={getStatusColor(instance.status)}
                              >
                                {instance.status}
                              </Chip>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px',
                              }}
                            >
                              {parsed.count && parsed.count > 1 && (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {parsed.count}x
                                </Chip>
                              )}
                              {parsed.cpus && (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {parsed.cpus} CPU{parsed.cpus > 1 ? 's' : ''}
                                </Chip>
                              )}
                              {parsed.memory && (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {parsed.memory}GB RAM
                                </Chip>
                              )}
                              {parsed.gpu && (
                                <Chip size="sm" variant="soft" color="primary">
                                  {parsed.gpu}
                                </Chip>
                              )}
                              {parsed.disk && (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {parsed.disk}GB disk
                                </Chip>
                              )}
                              {parsed.instanceName && (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {parsed.instanceName}
                                </Chip>
                              )}
                            </div>
                          </MenuItem>
                        );
                      })
                    )}
                  </Menu>
                </Dropdown>
                <Button variant="outlined" onClick={() => onEditTask?.(row)}>
                  Edit
                </Button>
                <IconButton
                  variant="plain"
                  color="danger"
                  onClick={() => onDeleteTask?.(row.id)}
                  title="Delete task"
                >
                  <Trash2Icon style={{ cursor: 'pointer' }} />
                </IconButton>
              </ButtonGroup>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

export default TaskTemplateList;
