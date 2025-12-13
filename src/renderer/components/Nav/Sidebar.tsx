import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, CSSProperties } from 'react';

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
import { fetchWithAuth, useAPI, useAuth } from 'renderer/lib/authContext';
import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import LoginChip from './UserWidget';

interface ExperimentMenuItemsProps {
  experimentInfo: any;
  models: any;
  mode: string;
}

function ExperimentMenuItems({
  experimentInfo,
  models,
  mode,
}: ExperimentMenuItemsProps) {
  const { team } = useAuth();
  const isS3Mode = mode === 's3';
  const [pipelineTag, setPipelineTag] = useState<string | null>(null);
  const [isValidDiffusionModel, setIsValidDiffusionModel] = useState<
    boolean | null
  >(null);
  const experimentReady = Boolean(experimentInfo?.name);
  const hasFoundation = Boolean(experimentInfo?.config?.foundation);

  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );
  const hasProviders = providers.length > 0;

  const pipelineIsTTS = pipelineTag === 'text-to-speech';
  const pipelineIsSTT = pipelineTag === 'speech-to-text';
  const isDiffusionModel = isValidDiffusionModel === true;
  const showInteractTab =
    !isS3Mode && !isDiffusionModel && !pipelineIsTTS && !pipelineIsSTT;
  const showDiffusionTab = !isS3Mode && isDiffusionModel;
  const showAudioTTSTab = !isS3Mode && pipelineIsTTS;
  const showAudioSTTTab = !isS3Mode && pipelineIsSTT;

  const isActiveModelDifferent = useMemo(() => {
    if (!models || !experimentReady) return true;

    const activeModelId = models[0]?.id;
    const normalize = (value?: string | null) =>
      value?.split?.('/')?.slice(-1)?.[0] ?? value;
    const config = experimentInfo?.config;

    return (
      activeModelId !== normalize(config?.foundation) &&
      activeModelId !== normalize(config?.foundation_filename) &&
      activeModelId !== config?.adaptor
    );
  }, [models, experimentReady, experimentInfo?.config]);

  const disableInteract = !experimentReady || isActiveModelDifferent;
  const disableEval = !experimentReady || isDiffusionModel;
  const disableExport = !experimentReady || !hasFoundation;

  useEffect(() => {
    if (!experimentInfo?.id || !hasFoundation) {
      setIsValidDiffusionModel(false);
      setPipelineTag(null);
      return;
    }

    let isMounted = true;
    setIsValidDiffusionModel(null);

    const checkValidDiffusionAndPipelineTag = async () => {
      try {
        const pipelineResponse = await fetchWithAuth(
          getAPIFullPath('models', ['pipeline_tag'], {
            modelName: experimentInfo.config.foundation,
          }),
          { method: 'GET' },
        );

        if (!isMounted) return;

        const pipelineData = pipelineResponse.ok
          ? ((await pipelineResponse.json())?.data ?? null)
          : null;

        setPipelineTag(pipelineData);

        if (pipelineData === 'text-to-speech') {
          setIsValidDiffusionModel(false);
          return;
        }

        const diffusionResponse = await fetchWithAuth(
          getAPIFullPath('diffusion', ['checkValidDiffusion'], {
            experimentId: experimentInfo.id,
          }),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: experimentInfo.config.foundation }),
          },
        );

        if (!isMounted) return;

        if (!diffusionResponse.ok) {
          setIsValidDiffusionModel(false);
          return;
        }

        const diffusionData = await diffusionResponse.json();
        setIsValidDiffusionModel(
          diffusionData?.is_valid_diffusion_model ?? false,
        );
      } catch {
        if (isMounted) {
          setPipelineTag(null);
          setIsValidDiffusionModel(false);
        }
      }
    };

    checkValidDiffusionAndPipelineTag();

    // eslint-disable-next-line consistent-return
    return function cleanup() {
      isMounted = false;
    };
  }, [experimentInfo?.id, experimentInfo?.config?.foundation, hasFoundation]);

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
            disabled={!experimentReady}
          />
        )}
        {showInteractTab && (
          <SubNavItem
            title="Interact"
            path="/experiment/chat"
            icon={<MessageCircleIcon strokeWidth={9} />}
            disabled={disableInteract}
          />
        )}
        {showDiffusionTab && (
          <SubNavItem
            title="Diffusion"
            path="/experiment/diffusion"
            icon={<RiImageAiLine />}
            disabled={!experimentReady}
          />
        )}
        {showAudioTTSTab && (
          <SubNavItem
            title="Audio"
            path="/experiment/audio"
            icon={<AudioLinesIcon />}
            disabled={disableInteract}
          />
        )}
        {showAudioSTTTab && (
          <SubNavItem
            title="Audio"
            path="/experiment/audio-stt"
            icon={<AudioLinesIcon />}
            disabled={disableInteract}
          />
        )}
        {!isS3Mode && (
          <SubNavItem
            title="Train"
            path="/experiment/training"
            icon={<GraduationCapIcon />}
            disabled={!experimentReady}
          />
        )}
        {hasProviders && (
          <SubNavItem
            title="Tasks"
            path="/experiment/tasks"
            icon={<StretchHorizontalIcon />}
            disabled={!experimentReady}
          />
        )}
        {!isS3Mode && (
          <SubNavItem
            title="Generate"
            path="/experiment/generate"
            icon={<SquareStackIcon />}
            disabled={!experimentReady}
          />
        )}
        {!isS3Mode && (
          <SubNavItem
            title="Evaluate"
            path="/experiment/eval"
            icon={<ChartColumnIncreasingIcon />}
            disabled={disableEval}
          />
        )}
        <SubNavItem
          title="Documents"
          path="/experiment/documents"
          icon={<FileIcon />}
          disabled={!experimentReady}
        />
        {!isS3Mode && (
          <SubNavItem
            title="Export"
            path="/experiment/export"
            icon={<ArrowRightFromLineIcon />}
            disabled={disableExport}
          />
        )}
        <SubNavItem
          title="Notes"
          path="/experiment/notes"
          icon={<FlaskConicalIcon />}
          disabled={!experimentReady}
        />
      </>
    </List>
  );
}

interface GlobalMenuItemsProps {
  outdatedPluginsCount: number | undefined;
  mode: string;
  hasProviders: boolean;
  experimentInfo: any;
}

function GlobalMenuItems({
  outdatedPluginsCount,
  mode,
  hasProviders,
  experimentInfo,
}: GlobalMenuItemsProps) {
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

      <SubNavItem title="Model Registry" path="/zoo" icon={<BoxesIcon />} />
      <SubNavItem title="Datasets" path="/data" icon={<FileTextIcon />} />
      {hasProviders && (
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
      {hasProviders && (
        <SubNavItem title="Compute" path="/compute" icon={<MonitorIcon />} />
      )}
      {!isS3Mode && (
        <SubNavItem title="Computer" path="/computer" icon={<MonitorIcon />} />
      )}
    </List>
  );
}

interface BottomMenuItemsProps {
  navigate: (path: string) => void;
  themeSetter: (theme: string) => void;
}

function BottomMenuItems({ navigate, themeSetter }: BottomMenuItemsProps) {
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

interface SidebarProps {
  logsDrawerOpen?: boolean;
  setLogsDrawerOpen?: (open: boolean) => void;
  themeSetter: (theme: string) => void;
}

export default function Sidebar({
  logsDrawerOpen: _logsDrawerOpen, // eslint-disable-line @typescript-eslint/no-unused-vars
  setLogsDrawerOpen: _setLogsDrawerOpen, // eslint-disable-line @typescript-eslint/no-unused-vars
  themeSetter,
}: SidebarProps) {
  const { experimentInfo } = useExperimentInfo();
  const { models } = useModelStatus();
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);
  const [mode, setMode] = useState<string>('local');

  const navigate = useNavigate();
  const isDevExperiment = experimentInfo?.name === 'dev';

  const { team } = useAuth();

  // Fetch compute_provider to determine if Tasks tab should be visible
  const { data: providerListData } = useAPI('compute_provider', ['list'], {
    teamId: team?.id ?? null,
  });

  const providers = useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const hasProviders = providers.length > 0;

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
        style={
          {
            width: '100%',
            height: '52px',
            WebkitAppRegion: 'drag',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            color: 'var(--joy-palette-neutral-plainDisabledColor)',
          } as CSSProperties
        }
      >
        {isDevExperiment && <>v{(window as any).platform?.version}</>}
      </div>
      <SelectExperimentMenu models={models} />
      <ExperimentMenuItems
        experimentInfo={experimentInfo}
        models={models}
        mode={mode}
      />
      <GlobalMenuItems
        outdatedPluginsCount={outdatedPlugins?.length}
        mode={mode}
        hasProviders={hasProviders}
        experimentInfo={experimentInfo}
      />
      {process.env.MULTIUSER === 'true' && <LoginChip />}
      <BottomMenuItems navigate={navigate} themeSetter={themeSetter} />
    </Sheet>
  );
}
