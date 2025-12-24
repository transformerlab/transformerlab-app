import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  CardContent,
  Tab,
  TabList,
  Tabs,
  FormControl,
  Grid,
  Input,
  LinearProgress,
  Sheet,
  Box,
  Typography,
  Stack,
  Chip,
  CardActions,
  Checkbox,
} from '@mui/joy';
import {
  SearchIcon,
  GithubIcon,
  DownloadIcon,
  ScanTextIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { useNotification } from '../Shared/NotificationSystem';
import NewTeamTaskModal from './NewTeamTaskModal';

// Custom filter function for tasks gallery (uses 'title' instead of 'name')
function filterTasksGallery(data: any[], searchText: string = '') {
  const lowerSearch = searchText.toLowerCase();
  const filteredData = data.filter((task) => {
    const title = task.title || '';
    const description = task.description || '';
    return (
      title.toLowerCase().includes(lowerSearch) ||
      description.toLowerCase().includes(lowerSearch) ||
      (task.github_repo_url || '').toLowerCase().includes(lowerSearch)
    );
  });
  return filteredData;
}

function formatGithubPath(repoUrl?: string, repoDir?: string) {
  if (!repoUrl) return '';
  // remove https:// in front of repoUrl if it exists
  const cleanedRepoUrl = repoUrl.replace(/^https?:\/\//, '');
  // remove .git from end of url if it exists:
  const finalRepoUrl = cleanedRepoUrl.replace(/\.git$/, '');
  return repoDir ? `${finalRepoUrl}/${repoDir}` : finalRepoUrl;
}

function generateGithubLink(repoUrl?: string, repoDir?: string) {
  if (!repoUrl) return '';
  const finalRepoUrl = repoUrl.replace(/\.git$/, '');
  return repoDir ? `${finalRepoUrl}/tree/main/${repoDir}` : finalRepoUrl;
}

function TaskIcon({ icon, color }: { icon: React.ReactNode; color?: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        color: color || 'inherit',
      }}
    >
      {icon}
    </Box>
  );
}

function TaskCard({
  task,
  index,
  onImport,
  isImporting,
  disableImport,
  showCheckbox,
  isSelected,
  onSelect,
}: {
  task: any;
  index: number;
  onImport: (idx: number) => void;
  isImporting: boolean;
  disableImport: boolean;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onSelect?: (taskId: string, selected: boolean) => void;
}) {
  const taskId = task?.id || task?.title || index.toString();
  return (
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
            <TaskIcon icon={<ScanTextIcon />} color="#1976d2" />
            {showCheckbox && (
              <Checkbox
                checked={isSelected || false}
                onChange={(e) => onSelect?.(taskId, e.target.checked)}
                sx={{ mt: -0.5 }}
              />
            )}
          </Box>
          <Box>
            <Typography level="title-lg">
              {task?.title || 'Untitled Task'}
            </Typography>
            {task?.description && (
              <Typography level="body-sm" sx={{ mt: 1 }}>
                {task.description}
              </Typography>
            )}
            {task?.github_repo_url && (
              <Box
                sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <Box
                  component="a"
                  href={generateGithubLink(
                    task.github_repo_url,
                    task?.github_repo_dir,
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
                  )}
                </Typography>
              </Box>
            )}
          </Box>
          {task?.metadata?.framework && (
            /* Framework is an array of strings */
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {task.metadata.framework.map((fw: string, fwIndex: number) => (
                <Chip key={fwIndex} size="sm" variant="soft">
                  {fw}
                </Chip>
              ))}
            </Stack>
          )}
          {/* {task.config && (
            <Stack spacing={0.5}>
              <Typography level="body-xs" fontWeight="bold">
                Compute:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {task.config.cpus && (
                  <Chip size="sm" variant="soft">
                    CPUs: {task.config.cpus}
                  </Chip>
                )}
                {task.config.memory && (
                  <Chip size="sm" variant="soft">
                    Memory: {task.config.memory}GB
                  </Chip>
                )}
                {task.config.accelerators && (
                  <Chip size="sm" variant="soft">
                    {task.config.accelerators}
                  </Chip>
                )}
              </Stack>
            </Stack>
          )} */}
        </Stack>
        <CardActions>
          <Button
            variant="soft"
            color="success"
            endDecorator={<DownloadIcon size={16} />}
            onClick={() => onImport(index)}
            loading={isImporting}
            disabled={disableImport}
          >
            Import
          </Button>
        </CardActions>
      </CardContent>
    </Card>
  );
}

export default function TasksGallery() {
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'global' | 'team'>('global');
  const { experimentInfo } = useExperimentInfo();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const [importingIndex, setImportingIndex] = useState<number | null>(null);
  const [newTeamTaskModalOpen, setNewTeamTaskModalOpen] = useState(false);
  const [isSubmittingTeamTask, setIsSubmittingTeamTask] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Task.Gallery(experimentInfo.id)
      : null,
    fetcher,
  );
  const {
    data: teamData,
    isLoading: teamLoading,
    mutate: teamMutate,
    isError: teamError,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Task.TeamGallery(experimentInfo.id)
      : null,
    fetcher,
  );

  const handleImport = async (galleryIndex: number) => {
    if (!experimentInfo?.id) {
      addNotification({
        type: 'warning',
        message: 'Please select an experiment first before importing a task.',
      });
      navigate('/');
      return;
    }

    setImportingIndex(galleryIndex);
    try {
      const endpoint =
        activeTab === 'team'
          ? chatAPI.Endpoints.Task.ImportFromTeamGallery(experimentInfo.id)
          : chatAPI.Endpoints.Task.ImportFromGallery(experimentInfo.id);
      const response = await chatAPI.authenticatedFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gallery_id: galleryIndex.toString(),
          experiment_id: experimentInfo.id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to import task: ${errorText}`,
        });
        return;
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: result.message || 'Task imported successfully!',
      });

      if (activeTab === 'team') {
        teamMutate();
      } else {
        mutate();
      }

      // Navigate to the tasks page for the experiment
      navigate(`/experiment/tasks`);
    } catch (err: any) {
      console.error('Error importing template:', err);
      addNotification({
        type: 'danger',
        message: `Failed to import template: ${err?.message || String(err)}`,
      });
    } finally {
      setImportingIndex(null);
    }
  };

  const handleAddTeamTask = async (data: {
    title: string;
    description?: string;
    setup?: string;
    command: string;
    cpus?: string;
    memory?: string;
    accelerators?: string;
    github_repo_url?: string;
    github_repo_dir?: string;
  }) => {
    setIsSubmittingTeamTask(true);
    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.AddToTeamGallery(experimentInfo?.id || ''),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to add team template: ${errorText}`,
        });
        return;
      }

      const result = await response.json();
      addNotification({
        type: 'success',
        message: result?.message || 'Team template added successfully!',
      });

      // Refresh the team gallery
      teamMutate();
    } catch (err: any) {
      console.error('Error adding team template:', err);
      addNotification({
        type: 'danger',
        message: `Failed to add team template: ${err?.message || String(err)}`,
      });
    } finally {
      setIsSubmittingTeamTask(false);
    }
  };

  const handleSelectTask = (taskId: string, selected: boolean) => {
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedTasks.size === 0) return;

    // eslint-disable-next-line no-alert
    if (
      !confirm(
        `Are you sure you want to delete ${selectedTasks.size} template(s)? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setIsDeleting(true);
    const taskIds = Array.from(selectedTasks);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const taskId of taskIds) {
        try {
          const response = await chatAPI.authenticatedFetch(
            chatAPI.Endpoints.Task.DeleteFromTeamGallery(
              experimentInfo?.id || '',
            ),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ task_id: taskId }),
            },
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(`Error deleting template ${taskId}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        addNotification({
          type: 'success',
          message: `Successfully deleted ${successCount} template(s)${
            failCount > 0 ? `. ${failCount} failed.` : '.'
          }`,
        });
        // Clear selection and refresh gallery
        setSelectedTasks(new Set());
        teamMutate();
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to delete templates. Please try again.',
        });
      }
    } catch (err: any) {
      console.error('Error deleting templates:', err);
      addNotification({
        type: 'danger',
        message: `Failed to delete templates: ${err?.message || String(err)}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const globalGallery = data?.data || [];
  const teamGallery = teamData?.data || [];
  const gallery = activeTab === 'team' ? teamGallery : globalGallery;
  const isActiveLoading = activeTab === 'team' ? teamLoading : isLoading;

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
      }}
    >
      <NewTeamTaskModal
        open={newTeamTaskModalOpen}
        onClose={() => setNewTeamTaskModalOpen(false)}
        onSubmit={handleAddTeamTask}
        isSubmitting={isSubmittingTeamTask}
      />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Tabs
          size="sm"
          value={activeTab}
          onChange={(_e, val) => {
            if (val) {
              setActiveTab(val as 'global' | 'team');
              // Clear selection when switching tabs
              setSelectedTasks(new Set());
            }
          }}
        >
          <TabList>
            <Tab value="global">Tasks Gallery</Tab>
            <Tab value="team">Team Specific Tasks</Tab>
          </TabList>
        </Tabs>
        {activeTab === 'team' && (
          <Stack direction="row" spacing={1}>
            {selectedTasks.size > 0 && (
              <Button
                startDecorator={<Trash2Icon size={16} />}
                onClick={handleDeleteSelected}
                size="sm"
                color="danger"
                variant="soft"
                loading={isDeleting}
              >
                Delete Selected ({selectedTasks.size})
              </Button>
            )}
            <Button
              startDecorator={<PlusIcon size={16} />}
              onClick={() => setNewTeamTaskModalOpen(true)}
              size="sm"
            >
              Add Team Task
            </Button>
          </Stack>
        )}
      </Box>
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          pb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: {
              xs: '120px',
              md: '160px',
            },
          },
        }}
      >
        <FormControl sx={{ flex: 2 }} size="sm">
          <Input
            placeholder="Search tasks..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>
      </Box>
      <Sheet
        className="OrderTableContainer"
        sx={{
          width: '100%',
          height: '100%',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          paddingRight: 2,
        }}
      >
        {isActiveLoading && <LinearProgress />}
        {!isActiveLoading && gallery.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography level="body-lg" color="neutral">
              No tasks available in the gallery.
            </Typography>
            {teamError && activeTab === 'team' && (
              <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>
                Failed to load team tasks. Check workspace
                team_specific_tasks.json.
              </Typography>
            )}
          </Box>
        )}
        {!isActiveLoading && gallery.length > 0 && (
          <Grid container spacing={2} sx={{ flexGrow: 1 }}>
            {filterTasksGallery(gallery, searchText).map(
              (task: any, index: number) => {
                const taskId = task?.id || task?.title || index.toString();
                return (
                  <Grid xs={12} sm={12} md={6} lg={4} xl={3} key={index}>
                    <TaskCard
                      task={task}
                      index={index}
                      onImport={handleImport}
                      isImporting={importingIndex === index}
                      disableImport={
                        !experimentInfo?.id || importingIndex !== null
                      }
                      showCheckbox={activeTab === 'team'}
                      isSelected={selectedTasks.has(taskId)}
                      onSelect={handleSelectTask}
                    />
                  </Grid>
                );
              },
            )}
          </Grid>
        )}
      </Sheet>
    </Sheet>
  );
}
