import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

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

import { RiImageAiLine } from 'react-icons/ri';

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
  getFullPath,
} from 'renderer/lib/transformerlab-api-sdk';

import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';

function ExperimentMenuItems({ DEV_MODE, experimentInfo, models }) {
  const [isValidDiffusionModel, setIsValidDiffusionModel] = useState<
    boolean | null
  >(null);

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

  // Check if the current foundation model is a diffusion model
  useEffect(() => {
    const checkValidDiffusion = async () => {
      if (!experimentInfo?.config?.foundation) {
        setIsValidDiffusionModel(false);
        return;
      }

      try {
        const response = await fetch(
          getFullPath('diffusion', ['checkValidDiffusion'], {}),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: experimentInfo.config.foundation }),
          },
        );

        // Handle 404 or other non-ok responses
        if (!response.ok) {
          setIsValidDiffusionModel(false);
          return;
        }

        const data = await response.json();
        // Handle case where is_valid_diffusion_model property doesn't exist
        setIsValidDiffusionModel(data.is_valid_diffusion_model ?? false);
      } catch (e) {
        setIsValidDiffusionModel(false);
      }
    };

    checkValidDiffusion();
  }, [experimentInfo?.config?.foundation]);

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
        title="Foundation"
        path="/experiment/model"
        icon={<LayersIcon strokeWidth={1} />}
        disabled={!experimentInfo?.name}
      />
      {/* Show Interact tab only if the model is NOT a diffusion model */}
      {(isValidDiffusionModel === false || isValidDiffusionModel === null) && (
        <SubNavItem
          title="Interact"
          path="/experiment/chat"
          icon={<MessageCircleIcon strokeWidth={9} />}
          disabled={!experimentInfo?.name || activeModelIsNotSameAsFoundation()}
        />
      )}
      {/* Show Diffusion tab only if the model IS a diffusion model */}
      {isValidDiffusionModel === true && (
        <SubNavItem
          title="Diffusion"
          path="/experiment/diffusion"
          icon={<RiImageAiLine />}
          disabled={!experimentInfo?.name}
        />
      )}
      <SubNavItem
        title="Workflows"
        path="/experiment/workflows"
        icon={<WorkflowIcon />}
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
        disabled={!experimentInfo?.name || isValidDiffusionModel === true}
      />
      <SubNavItem
        title="Documents"
        path="/experiment/documents"
        icon={<FileIcon />}
        disabled={!experimentInfo?.name}
      />
      <SubNavItem
        title="Export"
        path="/experiment/export"
        icon={<ArrowRightFromLineIcon />}
        disabled={!experimentInfo?.name || !experimentInfo?.config?.foundation}
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
