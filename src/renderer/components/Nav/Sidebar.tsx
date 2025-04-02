import { useNavigate } from 'react-router-dom';

import List from '@mui/joy/List';
import Divider from '@mui/joy/Divider';

import {
  CodeIcon,
  GraduationCapIcon,
  LayersIcon,
  MessageCircleIcon,
  BoxesIcon,
  FileTextIcon,
  MonitorIcon,
  FlaskConicalIcon,
  SettingsIcon,
  GithubIcon,
  ArrowRightFromLineIcon,
  PlugIcon,
  TextIcon,
  SquareStackIcon,
  FileIcon,
  ChartColumnIncreasingIcon,
  WorkflowIcon,
  UserIcon,
  LogOutIcon,
} from 'lucide-react';

import {
  Box,
  ButtonGroup,
  IconButton,
  Sheet,
  Tooltip,
  Typography,
} from '@mui/joy';

import {
  useModelStatus,
  usePluginStatus,
} from 'renderer/lib/transformerlab-api-sdk';

import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';

function ExperimentMenuItems({ DEV_MODE, experimentInfo, models }) {
  function activeModelIsNotSameAsFoundation() {
    if (models === null) {
      return true;
    }

    if (!experimentInfo?.name) {
      return true;
    }

    // The API may respond with the ID of the model, or the model filename or the adaptor
    return (
      models?.[0]?.id !==
        experimentInfo?.config?.foundation?.split('/').slice(-1)[0] &&
      models?.[0]?.id !==
        experimentInfo?.config?.foundation_filename?.split('/').slice(-1)[0] &&
      models?.[0]?.id !== experimentInfo?.config.adaptor
    );
  }

  return (
    <>
      {' '}
      <List
        sx={{
          '--ListItem-radius': '8px',
          '--ListItem-minHeight': '32px',
          '--List-gap': '4px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <SubNavItem
          title="Foundation"
          path="/experiment/model"
          icon={<LayersIcon />}
          disabled={!experimentInfo?.name}
        />
        {/* <SubNavItem
          title="Prompt"
          path="/experiment/prompt"
          icon={<TextSelectIcon />}
          disabled={!experimentInfo?.name}
        /> */}
        <SubNavItem
          title="Interact"
          path="/experiment/chat"
          icon={<MessageCircleIcon />}
          disabled={!experimentInfo?.name || activeModelIsNotSameAsFoundation()}
        />
        {DEV_MODE && (
          <SubNavItem
            title="Workflows"
            path="/experiment/workflows"
            icon={<WorkflowIcon />}
            disabled={!experimentInfo?.name}
          />
        )}
        <SubNavItem
          title="Train"
          path="/experiment/training"
          icon={<GraduationCapIcon />}
          disabled={!experimentInfo?.name}
        />
        <SubNavItem
          title="Export"
          path="/experiment/export"
          icon={<ArrowRightFromLineIcon />}
          disabled={
            !experimentInfo?.name || !experimentInfo?.config?.foundation
          }
        />
        <SubNavItem
          title="Generate"
          path="/experiment/generate"
          icon={<SquareStackIcon />}
          disabled={
            !experimentInfo?.name || !experimentInfo?.config?.foundation
          }
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
    </>
  );
}

function GlobalMenuItems({ DEV_MODE, experimentInfo, outdatedPluginsCount }) {
  return (
    <>
      {' '}
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        <Divider sx={{ marginBottom: 2 }} />

        <SubNavItem title="Model Zoo" path="/zoo" icon={<BoxesIcon />} />
        <SubNavItem title="Datasets" path="/data" icon={<FileTextIcon />} />
        <SubNavItem
          title="API"
          path="/api"
          icon={<CodeIcon />}
          disabled={!experimentInfo?.name}
        />
        <SubNavItem title="Logs" path="/logs" icon={<TextIcon />} />
        <SubNavItem
          title="Plugins"
          path="/plugins"
          icon={<PlugIcon />}
          counter={outdatedPluginsCount}
        />
        <SubNavItem title="Computer" path="/computer" icon={<MonitorIcon />} />
      </List>
    </>
  );
}

function BottomMenuItems({ DEV_MODE, navigate, themeSetter }) {
  return (
    <>
      {' '}
      <Divider sx={{ my: 2 }} />
      <Box
        sx={{
          display: DEV_MODE ? 'flex' : 'none',
          gap: 1,
          alignItems: 'center',
          mb: 1,
          maxWidth: '180px',
        }}
      >
        {/* <Avatar
variant="outlined"
size="sm"
src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=286"
/> */}
        <UserIcon />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            level="title-sm"
            sx={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            User Name
          </Typography>
          <Typography
            level="body-xs"
            sx={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            user@test.com
          </Typography>
        </Box>
        <IconButton size="sm" variant="plain" color="neutral">
          <LogOutIcon size="18px" />
        </IconButton>
      </Box>
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
        <Tooltip title="Settings">
          <IconButton variant="plain" onClick={() => navigate('/settings')}>
            <SettingsIcon strokeWidth={1} />
          </IconButton>
        </Tooltip>
      </ButtonGroup>
    </>
  );
}

export default function Sidebar({
  experimentInfo,
  setExperimentId,
  logsDrawerOpen,
  setLogsDrawerOpen,
  themeSetter,
}) {
  const { models, isError, isLoading } = useModelStatus();
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);

  const navigate = useNavigate();

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
        p: 2,
        py: 1,
        pt: '0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        userSelect: 'none',
        width: '100%',
        // opacity: 0.4,
        '& .lucide': {
          strokeWidth: '1.5px',
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
        {DEV_MODE && <>Transformer Lab v{window.platform?.version}</>}
      </div>
      <SelectExperimentMenu
        experimentInfo={experimentInfo}
        setExperimentId={setExperimentId}
        models={models}
      />
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
      <BottomMenuItems
        DEV_MODE={DEV_MODE}
        navigate={navigate}
        themeSetter={themeSetter}
      />
    </Sheet>
  );
}
