/* eslint-disable react/jsx-no-useless-fragment */
import Sheet from '@mui/joy/Sheet';
import { Box } from '@mui/joy';
import { useConnectionHealth } from 'renderer/lib/transformerlab-api-sdk';

import ModelCurrentlyPlayingBar from './ModelCurrentlyPlayingBar';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import ConnectionLostModal from './Shared/ConnectionLostModal';

export default function Header({ connection, setConnection }) {
  const { experimentInfo } = useExperimentInfo();
  const { isError: connectionHealthError, isLoading: connectionHealthLoading } =
    useConnectionHealth(connection);

  const isLocalMode = window?.platform?.multiuser !== true;
  // Use connection health (with timeout) so we get a definite fail when server is down;
  // useServerStats can hang and never set error
  const connectionLost =
    connection !== '' && !connectionHealthLoading && !!connectionHealthError;
  const showConnectionLostModal = connection !== '' && connectionLost;

  return (
    <Sheet
      sx={{
        gridArea: 'header',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: 1000,
        p: 0,
        color: '#888',
        userSelect: 'none',
        backgroundColor: 'var(--joy-palette-background-level1)',
      }}
      className="header"
    >
      <div
        style={
          {
            height: '100%',
            flex: 1,
            // border: '1px solid purple',
            WebkitAppRegion: 'drag',
          } as any
        }
      />
      {isLocalMode && (
        <div
          id="currently-playing"
          style={{
            backgroundColor: 'var(--joy-palette-background-level1)',
            // border: '1px solid red',
            height: '100%',
            padding: 0,
            margin: 0,
            flex: '1',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'flex',
          }}
        >
          <ModelCurrentlyPlayingBar experimentInfo={experimentInfo} />
        </div>
      )}

      <div
        style={
          {
            height: '100%',
            flex: 1,
            // border: '1px solid purple',
            WebkitAppRegion: 'drag',
          } as any
        }
      />
      <Box sx={{ mr: 2 }} />
      {showConnectionLostModal && (
        <ConnectionLostModal
          connection={connection}
          setConnection={setConnection}
        />
      )}
    </Sheet>
  );
}
