import { useState, useEffect } from 'react';

import {
  CodeIcon,
  BoxesIcon,
  FileTextIcon,
  FlaskConicalIcon,
  GithubIcon,
  FileIcon,
  StretchHorizontalIcon,
  LibraryBigIcon,
  ComputerIcon,
  GraduationCapIcon,
  SquareStackIcon,
  ChartColumnIncreasingIcon,
  LayersIcon,
} from 'lucide-react';

import {
  Box,
  ButtonGroup,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Tooltip,
  Typography,
} from '@mui/joy';

import {
  useModelStatus,
  usePluginStatus,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';

import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import { fetchWithAuth } from 'renderer/lib/authContext';

function ExperimentMenuItems({ DEV_MODE, experimentInfo, models }) {
  const [pipelineTag, setPipelineTag] = useState<string | null>(null);

  return (
    <List
      sx={{
        '--ListItem-radius': '6px',
        '--ListItem-minHeight': '32px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <SubNavItem
        title="Inference"
        path="/experiment/model"
        icon={<LayersIcon strokeWidth={1} />}
        disabled
      />
      <SubNavItem
        title="Tasks"
        path="/experiment/tasks"
        icon={<StretchHorizontalIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Train"
        path="/experiment/training"
        icon={<GraduationCapIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Generate"
        path="/experiment/generate"
        icon={<SquareStackIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Evaluate"
        path="/experiment/eval"
        icon={<ChartColumnIncreasingIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Documents"
        path="/experiment/documents"
        icon={<FileIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Notes"
        path="/experiment/notes"
        icon={<FlaskConicalIcon />}
        disabled={!experimentInfo?.name}
      />
    </List>
  );
}

function GlobalMenuItems({ DEV_MODE, experimentInfo, outdatedPluginsCount }) {
  // Get GPU orchestration server URL from healthz endpoint
  const [healthzData, setHealthzData] = useState<any>(null);

  useEffect(() => {
    const fetchHealthz = async () => {
      try {
        const data = await apiHealthz();
        setHealthzData(data);
      } catch (error) {
        console.error('Failed to fetch healthz data:', error);
      }
    };

    fetchHealthz();
  }, []);

  const handleGPUOrchestraionClick = () => {
    if (healthzData?.gpu_orchestration_server) {
      const gpuServerUrl = healthzData.gpu_orchestration_server;
      const port = healthzData.gpu_orchestration_server_port || '8000';

      // Construct the full URL
      let fullUrl = gpuServerUrl;
      if (!fullUrl.includes('://')) {
        fullUrl = `http://${fullUrl}`;
      }

      // Check if port is already included in the URL
      const urlObj = new URL(fullUrl);
      if (!urlObj.port && port && port !== '80' && port !== '443') {
        fullUrl = `${urlObj.protocol}//${urlObj.hostname}:${port}`;
      }

      // Ensure trailing slash
      if (!fullUrl.endsWith('/')) {
        fullUrl = `${fullUrl}/`;
      }

      // Open in new tab
      window.open(fullUrl, '_blank');
    }
  };

  return (
    <List
      sx={{
        '--ListItem-radius': '6px',
        '--ListItem-minHeight': '32px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <Divider sx={{ marginBottom: 1 }} />

      <SubNavItem title="Model Registry" path="/zoo" icon={<BoxesIcon />} />
      <SubNavItem title="Datasets" path="/data" icon={<FileTextIcon />} />
      <SubNavItem
        title="Task Library"
        path="/task_library"
        icon={<LibraryBigIcon />}
      />
      <SubNavItem
        title="API"
        path="/api"
        icon={<CodeIcon />}
        disabled={!experimentInfo?.name}
      />

      {/* Computer icon for GPU Orchestration */}
      {healthzData?.gpu_orchestration_server && (
        <ListItem className="FirstSidebar_Content">
          <ListItemButton
            variant="plain"
            onClick={handleGPUOrchestraionClick}
            sx={{
              '&:hover': {
                backgroundColor: 'var(--joy-palette-primary-100)',
              },
            }}
          >
            <ListItemDecorator sx={{ minInlineSize: '30px' }}>
              <ComputerIcon strokeWidth={1} />
            </ListItemDecorator>
            <ListItemContent>
              <Typography level="body-sm">GPU Orchestration</Typography>
            </ListItemContent>
          </ListItemButton>
        </ListItem>
      )}
    </List>
  );
}

function BottomMenuItems({ themeSetter }) {
  return (
    <>
      <Divider sx={{ my: 1 }} />
      <ButtonGroup
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <ColorSchemeToggle themeSetter={themeSetter} />
        <a
          href="https://github.com/transformerlab/transformerlab-app/"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit Transformer Lab on Github"
        >
          <Tooltip
            title={
              <>
                Visit Transformer Lab on Github
                <br />
                to contribute to the project or
                <br />
                send a bug report.
              </>
            }
          >
            <IconButton variant="plain">
              <GithubIcon strokeWidth={1} />
            </IconButton>
          </Tooltip>
        </a>
      </ButtonGroup>
    </>
  );
}

export default function SidebarForGPUOrchestration({
  logsDrawerOpen,
  setLogsDrawerOpen,
  themeSetter,
}) {
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { models, isError, isLoading } = useModelStatus();
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);

  const DEV_MODE = experimentInfo?.name === 'dev';

  return (
    <Sheet
      className="Sidebar"
      sx={{
        gridArea: 'sidebar',
        borderRight: '1px solid',
        borderColor: 'divider',
        transition: 'transform 0.4s',
        zIndex: 100,
        height: '100%',
        overflow: 'auto',
        top: 0,
        pl: 1.2,
        pr: 1,
        py: 1,
        pt: '0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        userSelect: 'none',
        width: '100%',
        // opacity: 0.4,
        '& .lucide': {
          strokeWidth: '1.5px',
          width: '18px',
          height: '18px',
        },
        '& .MuiBadge-root': {},
      }}
    >
      <div
        style={{
          width: '100%',
          height: '52px',
          '-webkit-app-region': 'drag',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          color: 'var(--joy-palette-neutral-plainDisabledColor)',
        }}
      >
        {DEV_MODE && <>v{window.platform?.version}</>}
      </div>
      <SelectExperimentMenu models={models} />
      <ExperimentMenuItems
        DEV_MODE={DEV_MODE}
        experimentInfo={experimentInfo}
        models={models}
      />
      <GlobalMenuItems
        DEV_MODE={DEV_MODE}
        experimentInfo={experimentInfo}
        outdatedPluginsCount={outdatedPlugins?.length}
      />
      <BottomMenuItems themeSetter={themeSetter} />
    </Sheet>
  );
}
