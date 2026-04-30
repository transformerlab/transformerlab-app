import { useNavigate } from 'react-router-dom';

import {
  CodeIcon,
  BoxesIcon,
  FileTextIcon,
  MonitorIcon,
  FlaskConicalIcon,
  SettingsIcon,
  GithubIcon,
  FileIcon,
  StretchHorizontalIcon,
} from 'lucide-react';

import {
  ButtonGroup,
  Divider,
  IconButton,
  List,
  Sheet,
  Tooltip,
} from '@mui/joy';

import { useModelStatus } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNotificationsSummary } from 'renderer/lib/useNotificationsSummary';
import SelectExperimentMenu from '../Experiment/SelectExperimentMenu';

import SubNavItem from './SubNavItem';
import ColorSchemeToggle from './ColorSchemeToggle';
import LoginChip from './UserWidget';

interface ExperimentMenuItemsProps {
  experimentInfo: any;
}

function ExperimentMenuItems({ experimentInfo }: ExperimentMenuItemsProps) {
  const experimentReady = Boolean(experimentInfo?.name);
  const basePath = experimentReady
    ? `/experiment/${encodeURIComponent(experimentInfo.name)}`
    : '#';

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
        <SubNavItem
          title="Tasks"
          path={`${basePath}/tasks`}
          matchPattern={[
            '/experiment/:experimentName/tasks/*',
            '/experiment/:experimentName/jobs/*',
          ]}
          icon={<StretchHorizontalIcon />}
          disabled={!experimentReady}
        />
        <SubNavItem
          title="Interact"
          path={`${basePath}/interactive`}
          matchPattern="/experiment/:experimentName/interactive"
          icon={<CodeIcon strokeWidth={1} />}
          disabled={!experimentReady}
        />
        <SubNavItem
          title="Documents"
          path={`${basePath}/documents`}
          matchPattern="/experiment/:experimentName/documents"
          icon={<FileIcon />}
          disabled={!experimentReady}
        />
        <SubNavItem
          title="Notes"
          path={`${basePath}/notes`}
          matchPattern="/experiment/:experimentName/notes"
          icon={<FlaskConicalIcon />}
          disabled={!experimentReady}
        />
      </>
    </List>
  );
}

interface GlobalMenuItemsProps {
  experimentInfo: any;
}

function GlobalMenuItems({ experimentInfo }: GlobalMenuItemsProps) {
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
        title="Tasks Gallery"
        path="/tasks-gallery"
        icon={<StretchHorizontalIcon />}
      />
      <SubNavItem title="Compute" path="/compute" icon={<MonitorIcon />} />
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
        <Tooltip title="User Settings">
          <IconButton variant="plain" onClick={() => navigate('/user')}>
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
  const notificationsSummary = useNotificationsSummary(experimentInfo);

  const navigate = useNavigate();

  return (
    <Sheet
      className="Sidebar"
      sx={{
        backgroundColor: '#f0f1f3ff',
        gridArea: 'sidebar',
        // borderRight: '1px solid',
        // borderColor: 'divider',
        transition: 'transform 0.4s',
        zIndex: 100,
        height: '100%',
        overflow: 'auto',
        top: 0,
        p: '1.1rem 1rem 1rem 1rem',
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
      <SelectExperimentMenu models={models} />
      <ExperimentMenuItems experimentInfo={experimentInfo} />
      <GlobalMenuItems experimentInfo={experimentInfo} />
      <LoginChip notificationsSummary={notificationsSummary} />
      <BottomMenuItems navigate={navigate} themeSetter={themeSetter} />
    </Sheet>
  );
}
