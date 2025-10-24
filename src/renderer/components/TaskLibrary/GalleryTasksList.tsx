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
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';

interface GalleryTask {
  id: string;
  name: string;
  description: string;
  tag: string;
  source: string;
}

interface GalleryTasksListProps {
  tasks: GalleryTask[];
  isLoading: boolean;
  onInstall: (id: string) => void;
  installingTasks: Set<string>;
  localTasks: Array<{ task_dir: string; name: string }>;
}

export default function GalleryTasksList({
  tasks,
  isLoading,
  onInstall,
  installingTasks,
  localTasks,
}: GalleryTasksListProps) {
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
          No gallery tasks available. Check your internet connection and try
          again.
        </Typography>
      </Sheet>
    );
  }

  return (
    <Stack spacing={2}>
      {tasks.map((task) => (
        <Card key={task.subdir} variant="outlined">
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
                  <ExternalLinkIcon size={16} />
                  <Typography level="title-sm">{task.name}</Typography>
                  <Chip size="sm" variant="soft" color="primary">
                    {task.tag}
                  </Chip>
                </Stack>
                <Typography level="body-sm" color="neutral" sx={{ mb: 2 }}>
                  {task.description || 'No description available'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="sm" variant="outlined" color="success">
                    Gallery
                  </Chip>
                </Stack>
              </Box>
              {(() => {
                const isInstalling = installingTasks.has(task.id);
                const isInstalled = localTasks.some(
                  (localTask) => localTask.task_dir === task.id,
                );

                if (isInstalling) {
                  return (
                    <Button size="sm" loading disabled>
                      Installing...
                    </Button>
                  );
                }

                if (isInstalled) {
                  return (
                    <Button
                      size="sm"
                      variant="outlined"
                      color="success"
                      disabled
                    >
                      Installed
                    </Button>
                  );
                }

                return (
                  <Button
                    size="sm"
                    startDecorator={<DownloadIcon size={16} />}
                    onClick={() => onInstall(task.id)}
                  >
                    Install
                  </Button>
                );
              })()}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
