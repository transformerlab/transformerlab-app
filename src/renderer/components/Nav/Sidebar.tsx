import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

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
  LogInIcon,
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
  useAPI,
  login,
  logout
} from 'renderer/lib/transformerlab-api-sdk';

import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';
import UserLoginModal from '../User/UserLoginModal';

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
      {/* <SubNavItem
          title="Prompt"
          path="/experiment/prompt"
          icon={<TextSelectIcon />}
          disabled={!experimentInfo?.name}
        /> */}
      <SubNavItem
        title="Interact"
        path="/experiment/chat"
        icon={<MessageCircleIcon strokeWidth={9} />}
        disabled={!experimentInfo?.name || activeModelIsNotSameAsFoundation()}
      />
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
        disabled={!experimentInfo?.name || !experimentInfo?.config?.foundation}
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

function UserDetailsPanel({userDetails, setUserDetails}) {
  console.log("Opening user details:");
  console.log(userDetails);
  return (
    <>
      <UserIcon />
      <Box
        sx={{ minWidth: 0, flex: 1 }}
      >
        <Typography
          level="title-sm"
          sx={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {userDetails?.name}
        </Typography>
        <Typography
          level="body-xs"
          sx={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {userDetails?.email}
        </Typography>
      </Box>

      <IconButton size="sm" variant="plain" color="neutral">
        <LogOutIcon
          size="18px"
          onClick={async() => {
            await logout();
            setUserDetails(null);
            alert("User logged out.");
          }}
        />
      </IconButton>
    </>
  );
}

function BottomMenuItems({ DEV_MODE, navigate, themeSetter }) {
  const [userLoginModalOpen, setUserLoginModalOpen] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const { data: userInfo, error: userError, isLoading: userLoading } = useAPI('users', ['me'], {});

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Box
        sx={{
          display: DEV_MODE ? 'flex' : 'none',
          gap: 1,
          alignItems: 'center',
          mb: 1,
          maxWidth: '180px',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'var(--joy-palette-neutral-100)',
            borderRadius: 'sm',
          },
        }}
      >

      {userDetails ? (
        <UserDetailsPanel
          userDetails={userDetails}
          setUserDetails={setUserDetails}
        />
      ) : (
        <Box
          sx={{
            display: DEV_MODE ? 'flex' : 'none',
            gap: 1,
            alignItems: 'center',
            mb: 1,
            maxWidth: '180px',
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'var(--joy-palette-neutral-100)',
              borderRadius: 'sm',
            },
          }}
          onClick={async() => {
            setUserLoginModalOpen(true);
            const result = await login("test@transformerlab.ai", "strawberrry");
            alert(result?.message);
            const newuserdeets = {
              "name": "This is a test",
              "email": "test@testy.com",
              "avatar": ""
            };
            console.log("Here's the object that's fucking up:");
            console.log(userDetails);
            setUserDetails(newuserdeets);
          }}
        >
          <Typography
            level="title-sm"
            sx={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Login
          </Typography>
          <IconButton size="sm" variant="plain" color="neutral">
            <LogInIcon
              size="18px"
            />
          </IconButton>
        </Box>
      )}
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
      <UserLoginModal open={userLoginModalOpen} onClose={() => setUserLoginModalOpen(false)} />
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
