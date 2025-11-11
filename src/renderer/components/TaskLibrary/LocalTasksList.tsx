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
import { UploadIcon, TrashIcon, FolderIcon } from 'lucide-react';

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

interface LocalTask {
  name: string;
  description: string;
  task_dir: string;
  source: string;
  tag: string;
  logo?: string;
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
        const hasLogo = task.logo && task.logo.trim() !== '';

        return (
          <Card
            key={task.task_dir}
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
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      flexWrap="wrap"
                    >
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
                      <Chip size="sm" variant="outlined">
                        {task.source === 'local_gallery'
                          ? 'Exported'
                          : 'Installed'}
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

                {/* Action Buttons */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    flexShrink: 0,
                  }}
                >
                  <Button
                    size="sm"
                    startDecorator={<UploadIcon size={16} />}
                    onClick={() => onImport(task.task_dir)}
                  >
                    Import
                  </Button>
                  <Stack direction="row" spacing={1}>
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
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
