import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';

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
  AudioLinesIcon,
  StretchHorizontalIcon,
} from 'lucide-react';

import { RiImageAiLine } from 'react-icons/ri';

import {
  ButtonGroup,
  Divider,
  IconButton,
  List,
  Sheet,
  Tooltip,
} from '@mui/joy';

import {
  useModelStatus,
  usePluginStatus,
  getAPIFullPath,
  apiHealthz,
} from 'renderer/lib/transformerlab-api-sdk';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import LoginChip from './UserWidget';
import { fetchWithAuth, useAPI, useAuth } from 'renderer/lib/authContext';

function ExperimentMenuItems({ DEV_MODE, experimentInfo, models, mode }) {
  const [pipelineTag, setPipelineTag] = useState<string | null>(null);
  const { team } = useAuth();

  const isS3Mode = mode === 's3';

  const [isValidDiffusionModel, setIsValidDiffusionModel] = useState<
    boolean | null
  >(null);

  // Fetch compute_provider to determine if Tasks tab should be visible
  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const hasProviders = providers.length > 0;

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

  // Check if the current foundation model is a diffusion model and fetch pipeline_tag in the same effect
  useEffect(() => {
    const checkValidDiffusionAndPipelineTag = async () => {
      if (!experimentInfo?.config?.foundation) {
        setIsValidDiffusionModel(false);
        setPipelineTag(null);
        return;
      }

      let pipelineTagResult = null;

      // Check pipeline_tag first
      try {
        const url = getAPIFullPath('models', ['pipeline_tag'], {
          modelName: experimentInfo.config.foundation,
        });
        const response = await fetchWithAuth(url, { method: 'GET' });
        if (!response.ok) {
          setPipelineTag(null);
        } else {
          const data = await response.json();
          console.log('Pipeline tag data:', data);
          pipelineTagResult = data?.data || null;
          setPipelineTag(pipelineTagResult);
        }
      } catch (e) {
        setPipelineTag(null);
        console.error('Error fetching pipeline tag:', e);
      }

      // If pipelineTag is text-to-speech, never show diffusion tab
      if (pipelineTagResult === 'text-to-speech') {
        setIsValidDiffusionModel(false);
        return;
      }

      // Otherwise, check diffusion
      try {
        const response = await fetchWithAuth(
          getAPIFullPath('diffusion', ['checkValidDiffusion'], {
            experimentId: experimentInfo.id,
          }),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: experimentInfo.config.foundation }),
          },
        );

        if (!response.ok) {
          setIsValidDiffusionModel(false);
        } else {
          const data = await response.json();
          setIsValidDiffusionModel(data.is_valid_diffusion_model ?? false);
        }
      } catch (e) {
        setIsValidDiffusionModel(false);
      }
    };
    checkValidDiffusionAndPipelineTag();
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
      <>
        {!isS3Mode && (
          <SubNavItem
            title="Foundation"
            path="/experiment/model"
            icon={<LayersIcon strokeWidth={1} />}
            disabled={!experimentInfo?.name}
          />
        )}
        {!isS3Mode &&
          (isValidDiffusionModel === false || isValidDiffusionModel === null) &&
          pipelineTag !== 'text-to-speech' &&
          pipelineTag !== 'speech-to-text' && (
            <SubNavItem
              title="Interact"
              path="/experiment/chat"
              icon={<MessageCircleIcon strokeWidth={9} />}
              disabled={
                !experimentInfo?.name || activeModelIsNotSameAsFoundation()
              }
            />
          )}
        {/* Show Diffusion tab only if the model IS a diffusion model */}
        {!isS3Mode && isValidDiffusionModel === true && (
          <SubNavItem
            title="Diffusion"
            path="/experiment/diffusion"
            icon={<RiImageAiLine />}
            disabled={!experimentInfo?.name}
          />
        )}
        {/* Show Audio tab only if pipelineTag is text-to-speech */}
        {!isS3Mode && pipelineTag === 'text-to-speech' && (
          <SubNavItem
            title="Audio"
            path="/experiment/audio"
            icon={<AudioLinesIcon />}
            disabled={
              !experimentInfo?.name || activeModelIsNotSameAsFoundation()
            }
          />
        )}
        {!isS3Mode && pipelineTag === 'speech-to-text' && (
          <SubNavItem
            title="Audio"
            path="/experiment/audio-stt"
            icon={<AudioLinesIcon />}
            disabled={
              !experimentInfo?.name || activeModelIsNotSameAsFoundation()
            }
          />
        )}
        {/* <SubNavItem
            title="Workflows"
            path="/experiment/workflows"
            icon={<WorkflowIcon />}
            disabled={!experimentInfo?.name}
          /> */}
        {!isS3Mode && (
          <SubNavItem
            title="Train"
            path="/experiment/training"
            icon={<GraduationCapIcon />}
            disabled={!experimentInfo?.name}
          />
        )}
        {hasProviders && (
          <SubNavItem
            title="Tasks"
            path="/experiment/tasks"
            icon={<StretchHorizontalIcon />}
            disabled={!experimentInfo?.name}
          />
        )}
        {!isS3Mode && (
          <SubNavItem
            title="Generate"
            path="/experiment/generate"
            icon={<SquareStackIcon />}
            disabled={!experimentInfo?.name}
          />
        )}
        {!isS3Mode && (
          <SubNavItem
            title="Evaluate"
            path="/experiment/eval"
            icon={<ChartColumnIncreasingIcon />}
            disabled={!experimentInfo?.name || isValidDiffusionModel === true}
          />
        )}
        <SubNavItem
          title="Documents"
          path="/experiment/documents"
          icon={<FileIcon />}
          disabled={!experimentInfo?.name}
        />
        {!isS3Mode && (
          <SubNavItem
            title="Export"
            path="/experiment/export"
            icon={<ArrowRightFromLineIcon />}
            disabled={
              !experimentInfo?.name || !experimentInfo?.config?.foundation
            }
          />
        )}
        <SubNavItem
          title="Notes"
          path="/experiment/notes"
          icon={<FlaskConicalIcon />}
          disabled={!experimentInfo?.name}
        />
      </>
    </List>
  );
}

function GlobalMenuItems({
  DEV_MODE,
  experimentInfo,
  outdatedPluginsCount,
  mode,
}) {
  const isS3Mode = mode === 's3';

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
      {isS3Mode && (
        <SubNavItem
          title="Tasks Gallery"
          path="/tasks-gallery"
          icon={<StretchHorizontalIcon />}
        />
      )}
      {!isS3Mode && (
        <SubNavItem
          title="API"
          path="/api"
          icon={<CodeIcon />}
          disabled={!experimentInfo?.name}
        />
      )}
      {!isS3Mode && (
        <SubNavItem title="Logs" path="/logs" icon={<TextIcon />} />
      )}
      {!isS3Mode && (
        <SubNavItem
          title="Plugins"
          path="/plugins"
          icon={<PlugIcon />}
          counter={outdatedPluginsCount}
        />
      )}
      {!isS3Mode && (
        <SubNavItem title="Computer" path="/computer" icon={<MonitorIcon />} />
      )}
    </List>
  );
}

function BottomMenuItems({ navigate, themeSetter }) {
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
  logsDrawerOpen,
  setLogsDrawerOpen,
  themeSetter,
}) {
  const { experimentInfo, setExperimentId } = useExperimentInfo();
  const { models, isError, isLoading } = useModelStatus();
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);
  const [mode, setMode] = useState<string>('local');

  const navigate = useNavigate();

  const DEV_MODE = experimentInfo?.name === 'dev';

  // Fetch healthz to get the mode
  useEffect(() => {
    const fetchHealthz = async () => {
      try {
        const data = await apiHealthz();
        if (data?.mode) {
          setMode(data.mode);
        }
      } catch (error) {
        console.error('Failed to fetch healthz data:', error);
      }
    };

    fetchHealthz();
  }, []);

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
        mode={mode}
      />
      <GlobalMenuItems
        DEV_MODE={DEV_MODE}
        experimentInfo={experimentInfo}
        outdatedPluginsCount={outdatedPlugins?.length}
        mode={mode}
      />
      {process.env.MULTIUSER === 'true' && <LoginChip />}
      <BottomMenuItems navigate={navigate} themeSetter={themeSetter} />
    </Sheet>
  );
}
