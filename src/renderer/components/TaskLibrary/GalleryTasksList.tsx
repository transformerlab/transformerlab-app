import React, { useState } from 'react';
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
  AspectRatio,
} from '@mui/joy';
import { DownloadIcon } from 'lucide-react';

// Component for task icon/logo with error handling
function TaskIcon({ logo, name }: { logo?: string; name: string }) {
  const [imageError, setImageError] = useState(false);
  const hasLogo = logo && logo.trim() !== '' && !imageError;

  if (!hasLogo) {
    return null;
  }

  return (
    <AspectRatio
      ratio="1"
      sx={{
        width: 64,
        height: 64,
        borderRadius: 'md',
        overflow: 'hidden',
        bgcolor: 'background.level1',
      }}
    >
      <img
        src={logo}
        alt={name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        onError={() => setImageError(true)}
      />
    </AspectRatio>
  );
}

interface GalleryTask {
  id?: string;
  subdir?: string;
  name: string;
  description: string;
  tag: string;
  source: string;
  logo?: string;
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

  // Helper function to get task identifier
  const getTaskId = (task: GalleryTask) => {
    return task.id || task.subdir || task.name;
  };

  // Helper function to get chip color based on tag
  const getTagColor = (
    tag: string,
  ): 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'info' => {
    const upperTag = tag.toUpperCase();
    if (upperTag === 'TRAIN') {
      return 'warning';
    }
    if (upperTag === 'EVAL' || upperTag === 'EVALUATE') {
      return 'success';
    }
    return 'neutral';
  };

  return (
    <Stack spacing={2}>
      {tasks.map((task) => {
        const taskId = getTaskId(task);

        const hasLogo = task.logo && task.logo.trim() !== '';

        return (
          <Card
            key={taskId}
            variant="outlined"
            sx={{
              transition: 'all 0.2s ease',
              position: 'relative',
              overflow: 'hidden',
              '&:hover': {
                boxShadow: 'md',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                spacing={2}
              >
                {/* Icon/Logo Section - only show if logo exists */}
                {hasLogo && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 64,
                      minHeight: 64,
                      flexShrink: 0,
                    }}
                  >
                    <TaskIcon logo={task.logo} name={task.name} />
                  </Box>
                )}

                {/* Content Section */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack spacing={1}>
                    {/* Name and Tag */}
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography level="title-lg" sx={{ fontWeight: 600 }}>
                        {task.name}
                      </Typography>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={getTagColor(task.tag)}
                      >
                        {task.tag}
                      </Chip>
                      <Chip size="sm" variant="outlined" color="success">
                        Gallery
                      </Chip>
                    </Stack>

                    {/* Description */}
                    <Typography
                      level="body-sm"
                      sx={{
                        color: 'text.tertiary',
                        lineHeight: 1.6,
                      }}
                    >
                      {task.description || 'No description available'}
                    </Typography>
                  </Stack>
                </Box>

                {/* Action Button */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  {(() => {
                    const isInstalling = installingTasks.has(taskId);
                    const isInstalled = localTasks.some(
                      (localTask) => localTask.task_dir === taskId,
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
                        onClick={() => onInstall(taskId)}
                      >
                        Install
                      </Button>
                    );
                  })()}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
