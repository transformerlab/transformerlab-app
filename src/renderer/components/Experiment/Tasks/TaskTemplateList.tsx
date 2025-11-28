import React from 'react';
import { Table, ButtonGroup, Typography, IconButton, Button } from '@mui/joy';
import { PlayIcon, Trash2Icon } from 'lucide-react';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';

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
