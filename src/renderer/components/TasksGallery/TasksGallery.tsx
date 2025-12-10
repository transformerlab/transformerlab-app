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
} from '@mui/joy';
import {
  SearchIcon,
  GithubIcon,
  FolderIcon,
  DownloadIcon,
  ScanTextIcon,
} from 'lucide-react';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { useNotification } from '../Shared/NotificationSystem';

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
}: {
  task: any;
  index: number;
  onImport: (idx: number) => void;
  isImporting: boolean;
  disableImport: boolean;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <TaskIcon icon={<ScanTextIcon />} color="#1976d2" />
          <Box>
            <Typography level="title-lg">
              {task.title || 'Untitled Task'}
            </Typography>
            {task.description && (
              <Typography level="body-sm" sx={{ mt: 1 }}>
                {task.description}
              </Typography>
            )}
          </Box>
          {task.config && (
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
          )}
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

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Tasks.Gallery(),
    fetcher,
  );
  const {
    data: teamData,
    error: teamError,
    isLoading: teamLoading,
    mutate: teamMutate,
  } = useSWR(chatAPI.Endpoints.Tasks.TeamGallery(), fetcher);

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
          ? chatAPI.Endpoints.Tasks.ImportFromTeamGallery(experimentInfo.id)
          : chatAPI.Endpoints.Tasks.ImportFromGallery(experimentInfo.id);
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
      console.error('Error importing task:', err);
      addNotification({
        type: 'danger',
        message: `Failed to import task: ${err?.message || String(err)}`,
      });
    } finally {
      setImportingIndex(null);
    }
  };

  if (error && activeTab === 'global')
    return (
      <Sheet sx={{ p: 2 }}>
        <Typography color="danger">
          Failed to load tasks from the gallery. Please check your connection or
          try again later.
        </Typography>
      </Sheet>
    );
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
      <Tabs
        size="sm"
        value={activeTab}
        onChange={(_e, val) => val && setActiveTab(val as 'global' | 'team')}
        sx={{ mb: 1 }}
      >
        <TabList>
          <Tab value="global">Tasks Gallery</Tab>
          <Tab value="team">Team Specific Tasks</Tab>
        </TabList>
      </Tabs>
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
              (task: any, index: number) => (
                <Grid xs={12} sm={12} md={6} lg={4} xl={3} key={index}>
                  <TaskCard
                    task={task}
                    index={index}
                    onImport={handleImport}
                    isImporting={importingIndex === index}
                    disableImport={
                      !experimentInfo?.id || importingIndex !== null
                    }
                  />
                </Grid>
              ),
            )}
          </Grid>
        )}
      </Sheet>
    </Sheet>
  );
}
