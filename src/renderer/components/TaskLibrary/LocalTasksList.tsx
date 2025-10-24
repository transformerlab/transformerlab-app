import React from 'react';
import {
  Sheet,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Box,
} from '@mui/joy';
import { UploadIcon, TrashIcon, FileIcon, FolderIcon } from 'lucide-react';

interface LocalTask {
  name: string;
  description: string;
  task_dir: string;
  source: string;
  tag: string;
}

interface LocalTasksListProps {
  tasks: LocalTask[];
  isLoading: boolean;
  onImport: (taskDir: string) => void;
  onDelete: (taskDir: string) => void;
  onShowFiles: (taskDir: string) => void;
}

export default function LocalTasksList({
  tasks,
  isLoading,
  onImport,
  onDelete,
  onShowFiles,
}: LocalTasksListProps) {
  if (isLoading) {
    return <LinearProgress />;
  }

  if (tasks.length === 0) {
    return (
      <Sheet
        variant="soft"
        sx={{
          p: 4,
          textAlign: 'center',
          borderRadius: 'md',
        }}
      >
        <Typography level="body-md" color="neutral">
          No local tasks available. Install tasks from the Gallery tab to get
          started.
        </Typography>
      </Sheet>
    );
  }

  return (
    <Stack spacing={2}>
      {tasks.map((task) => (
        <Card key={task.task_dir} variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box sx={{ flex: 1 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 1 }}
                >
                  <FileIcon size={16} />
                  <Typography level="title-sm">{task.name}</Typography>
                  <Chip size="sm" variant="soft" color="primary">
                    {task.tag}
                  </Chip>
                </Stack>
                <Typography level="body-sm" color="neutral" sx={{ mb: 2 }}>
                  {task.description || 'No description available'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="sm" variant="outlined">
                    {task.source === 'local_gallery' ? 'Exported' : 'Installed'}
                  </Chip>
                </Stack>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  size="sm"
                  startDecorator={<UploadIcon size={16} />}
                  onClick={() => onImport(task.task_dir)}
                >
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  startDecorator={<FolderIcon size={16} />}
                  onClick={() => onShowFiles(task.task_dir)}
                >
                  Files
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  color="danger"
                  startDecorator={<TrashIcon size={16} />}
                  onClick={() => onDelete(task.task_dir)}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
