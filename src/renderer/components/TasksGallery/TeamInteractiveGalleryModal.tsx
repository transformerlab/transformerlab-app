import React, { useState, useMemo } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  Input,
  Grid,
  Card,
  CardContent,
  CardActions,
  Box,
  Typography,
  Stack,
  Chip,
  Skeleton,
} from '@mui/joy';
import {
  SearchIcon,
  DownloadIcon,
  GithubIcon,
  ScanTextIcon,
  GraduationCapIcon,
  ChartColumnIncreasingIcon,
} from 'lucide-react';

interface InteractiveTask {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  icon?: string;
  supported_accelerators?: string;
  config?: {
    supported_accelerators?: string;
  };
  metadata?: {
    category?: string;
    framework?: string[];
  };
  github_repo_url?: string;
  github_repo_dir?: string;
  github_repo_branch?: string;
  github_branch?: string;
}

interface TeamInteractiveGalleryModalProps {
  open: boolean;
  onClose: () => void;
  tasks: InteractiveTask[];
  isLoading: boolean;
  onImport: (galleryIdentifier: string | number) => void;
  importingIndex: string | number | null;
}

function formatGithubPath(repoUrl?: string, repoDir?: string, branch?: string) {
  if (!repoUrl) return '';
  const cleanedRepoUrl = repoUrl
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '');
  const path = repoDir ? `${cleanedRepoUrl}/${repoDir}` : cleanedRepoUrl;
  return branch ? `${path} · ${branch}` : path;
}

function generateGithubLink(
  repoUrl?: string,
  repoDir?: string,
  branch?: string,
) {
  if (!repoUrl) return '';
  const finalRepoUrl = repoUrl.replace(/\.git$/, '');
  const treeBranch = branch || 'main';
  const pathSegment = repoDir ? `/${repoDir}` : '';
  return `${finalRepoUrl}/tree/${treeBranch}${pathSegment}`;
}

function TaskIcon({ category }: { category?: string }) {
  let icon = <ScanTextIcon />;
  let color: string = '#1976d2';

  switch (category) {
    case 'dataset-generation':
      icon = <ScanTextIcon />;
      color = '#1976d2';
      break;
    case 'training':
      icon = <GraduationCapIcon />;
      color = '#388e3c';
      break;
    case 'eval':
      icon = <ChartColumnIncreasingIcon />;
      color = '#d27d00';
      break;
    default:
      icon = <ScanTextIcon />;
      color = '#5b5e61ff';
      break;
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        color,
        backgroundColor: `${color}11`,
        padding: '1px',
      }}
    >
      {icon}
    </Box>
  );
}

function filterTasksGallery(data: InteractiveTask[], searchText: string = '') {
  const lowerSearch = searchText.toLowerCase();
  const filteredData = data.filter((task) => {
    const title = task.title || task.name || '';
    const description = task.description || '';
    return (
      title.toLowerCase().includes(lowerSearch) ||
      description.toLowerCase().includes(lowerSearch) ||
      (task.github_repo_url || '').toLowerCase().includes(lowerSearch) ||
      (task.github_repo_branch || task.github_branch || '')
        .toLowerCase()
        .includes(lowerSearch)
    );
  });
  return filteredData;
}

export default function TeamInteractiveGalleryModal({
  open,
  onClose,
  tasks,
  isLoading,
  onImport,
  importingIndex,
}: TeamInteractiveGalleryModalProps) {
  const [searchText, setSearchText] = useState('');

  const filteredTasks = useMemo(
    () => filterTasksGallery(tasks, searchText),
    [tasks, searchText],
  );

  return (
    <Modal
      aria-labelledby="team-interactive-gallery-modal"
      open={open}
      onClose={onClose}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <ModalDialog
        variant="outlined"
        layout="center"
        sx={{
          maxWidth: '90vw',
          width: '1200px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <DialogTitle id="team-interactive-gallery-modal">
          Import Interactive Tasks
        </DialogTitle>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflow: 'hidden',
            flex: 1,
          }}
        >
          <FormControl>
            <Input
              placeholder="Search tasks..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              startDecorator={<SearchIcon size={16} />}
              sx={{ mb: 2 }}
            />
          </FormControl>

          <Box
            sx={{
              overflow: 'auto',
              flex: 1,
              paddingRight: 1,
            }}
          >
            {isLoading && (
              <Grid container spacing={2}>
                {[...Array(6)].map((_, i) => (
                  <Grid xs={12} sm={12} md={6} lg={4} key={i}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Skeleton
                            variant="rectangular"
                            width={32}
                            height={32}
                          />
                          <Skeleton
                            variant="text"
                            level="title-lg"
                            width="60%"
                          />
                          <Skeleton
                            variant="text"
                            level="body-sm"
                            width="100%"
                          />
                          <Skeleton
                            variant="rectangular"
                            width="100%"
                            height={32}
                            sx={{ mt: 2 }}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}

            {!isLoading && filteredTasks.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-lg" color="neutral">
                  No tasks available.
                </Typography>
              </Box>
            )}

            {!isLoading && filteredTasks.length > 0 && (
              <Grid container spacing={2}>
                {filteredTasks.map((task: InteractiveTask, index: number) => {
                  const taskTitle = task.title || task.name || 'Untitled Task';
                  const hasIconUrl = !!task?.icon;
                  const taskId =
                    task?.id || task?.name || task?.title || index.toString();

                  let galleryIdentifier: string | number;
                  if (task?.id) {
                    galleryIdentifier = task.id;
                  } else if (task?.name) {
                    galleryIdentifier = task.name;
                  } else {
                    galleryIdentifier = index;
                  }

                  return (
                    <Grid xs={12} sm={12} md={6} lg={4} key={taskId}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Stack spacing={2}>
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                              }}
                            >
                              {hasIconUrl ? (
                                <Box
                                  component="img"
                                  src={task.icon}
                                  alt={taskTitle}
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    objectFit: 'contain',
                                    borderRadius: '4px',
                                  }}
                                />
                              ) : (
                                <TaskIcon category={task?.metadata?.category} />
                              )}
                            </Box>
                            <Box>
                              <Typography level="title-lg">
                                {taskTitle}
                              </Typography>
                              {task?.description && (
                                <Typography level="body-sm" sx={{ mt: 1 }}>
                                  {task.description}
                                </Typography>
                              )}
                              {task?.github_repo_url && (
                                <Box
                                  sx={{
                                    mt: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                  }}
                                >
                                  <Box
                                    component="a"
                                    href={generateGithubLink(
                                      task.github_repo_url,
                                      task?.github_repo_dir,
                                      task?.github_repo_branch ??
                                        task?.github_branch,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      color: 'text.secondary',
                                      textDecoration: 'none',
                                      '&:hover': {
                                        color: 'primary.plainColor',
                                      },
                                    }}
                                  >
                                    <GithubIcon size={16} />
                                  </Box>
                                  <Typography
                                    level="body-sm"
                                    component="a"
                                    href={generateGithubLink(
                                      task.github_repo_url,
                                      task?.github_repo_dir,
                                      task?.github_repo_branch ??
                                        task?.github_branch,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      fontSize: '0.75rem',
                                      color: 'text.secondary',
                                      textDecoration: 'none',
                                      '&:hover': {
                                        color: 'primary.plainColor',
                                        textDecoration: 'underline',
                                      },
                                    }}
                                  >
                                    {formatGithubPath(
                                      task.github_repo_url,
                                      task?.github_repo_dir,
                                      task?.github_repo_branch ??
                                        task?.github_branch,
                                    )}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                            {task?.metadata?.framework && (
                              <Stack
                                direction="row"
                                spacing={1}
                                flexWrap="wrap"
                              >
                                {task.metadata.framework.map(
                                  (fw: string, fwIndex: number) => (
                                    <Chip
                                      key={fwIndex}
                                      size="sm"
                                      variant="soft"
                                    >
                                      {fw}
                                    </Chip>
                                  ),
                                )}
                              </Stack>
                            )}
                            {(task.supported_accelerators ||
                              task.config?.supported_accelerators) && (
                              <Box sx={{ mt: 1.5 }}>
                                <Stack
                                  direction="row"
                                  spacing={0.5}
                                  flexWrap="wrap"
                                >
                                  <Chip
                                    size="sm"
                                    variant="soft"
                                    color="primary"
                                  >
                                    {task.supported_accelerators ||
                                      task.config?.supported_accelerators}
                                  </Chip>
                                </Stack>
                              </Box>
                            )}
                          </Stack>
                          <CardActions sx={{ mt: 2 }}>
                            <Button
                              variant="soft"
                              color="success"
                              endDecorator={<DownloadIcon size={16} />}
                              onClick={() => onImport(galleryIdentifier)}
                              loading={importingIndex === galleryIdentifier}
                              fullWidth
                            >
                              Import
                            </Button>
                          </CardActions>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
