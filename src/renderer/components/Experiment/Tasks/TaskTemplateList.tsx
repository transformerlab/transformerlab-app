import React from 'react';
import {
  Table,
  ButtonGroup,
  Typography,
  IconButton,
  Button,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
} from '@mui/joy';
import { PlayIcon, Trash2Icon, MoreVerticalIcon } from 'lucide-react';
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
  onExportTask?: (taskId: string) => void;
};

const TaskTemplateList: React.FC<TaskTemplateListProps> = ({
  tasksList,
  onDeleteTask,
  onQueueTask,
  onEditTask,
  onExportTask,
}) => {
  const getResourcesInfo = (task: TaskRow) => {
    if (task.type !== 'REMOTE') {
      return 'N/A';
    }

    // For templates, fields are stored directly (not nested in config)
    // Check if it's a template (no config or config is empty/just an object)
    const config =
      (typeof task.config === 'string'
        ? SafeJSONParse(task.config as string, {})
        : (task.config as any)) || {};

    // Check if config has nested structure (old task format) or is empty
    const isTemplate =
      !task.config ||
      (typeof config === 'object' && Object.keys(config).length === 0) ||
      (!config.command && !config.cluster_name);

    // Use template fields directly if it's a template, otherwise use config
    const cpus = isTemplate ? (task as any).cpus : config.cpus;
    const memory = isTemplate ? (task as any).memory : config.memory;
    const disk_space = isTemplate
      ? (task as any).disk_space
      : config.disk_space;
    const accelerators = isTemplate
      ? (task as any).accelerators
      : config.accelerators;
    const num_nodes = isTemplate ? (task as any).num_nodes : config.num_nodes;

    const resources: string[] = [];
    if (cpus) resources.push(`CPUs: ${cpus}`);
    if (memory) resources.push(`Memory: ${memory}`);
    if (disk_space) resources.push(`Disk: ${disk_space}`);
    if (accelerators) resources.push(`Accelerators: ${accelerators}`);
    if (num_nodes) resources.push(`Nodes: ${num_nodes}`);

    return resources.length > 0
      ? resources.join(', ')
      : 'No resources specified';
  };

  const getCommandInfo = (task: TaskRow) => {
    if (task.type !== 'REMOTE') {
      return 'N/A';
    }

    // For templates, fields are stored directly (not nested in config)
    const config =
      (typeof task.config === 'string'
        ? SafeJSONParse(task.config as string, {})
        : (task.config as any)) || {};

    // Check if config has nested structure (old task format) or is empty
    const isTemplate =
      !task.config ||
      (typeof config === 'object' && Object.keys(config).length === 0) ||
      (!config.command && !config.cluster_name);

    // Use template field directly if it's a template, otherwise use config
    const command = isTemplate
      ? (task as any).command || 'No command specified'
      : config.command || 'No command specified';

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
                {onExportTask && (
                  <Dropdown>
                    <MenuButton
                      slots={{ root: IconButton }}
                      slotProps={{
                        root: { variant: 'plain', color: 'neutral' },
                      }}
                      sx={{ minWidth: 0 }}
                    >
                      <MoreVerticalIcon size={16} />
                    </MenuButton>
                    <Menu>
                      <MenuItem onClick={() => onExportTask?.(row.id)}>
                        Export to Team Gallery
                      </MenuItem>
                    </Menu>
                  </Dropdown>
                )}
              </ButtonGroup>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

export default TaskTemplateList;
