/* eslint-disable react/jsx-no-useless-fragment */
import Sheet from '@mui/joy/Sheet';
import { Box, Stack, Tooltip, Typography } from '@mui/joy';
import { useConnectionHealth } from 'renderer/lib/transformerlab-api-sdk';
import { useEffect } from 'react';
import { Link2Icon } from 'lucide-react';

import { Link as ReactRouterLink } from 'react-router-dom';
import ModelCurrentlyPlayingBar from './ModelCurrentlyPlayingBar';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import ConnectionLostModal from './Shared/ConnectionLostModal';

function StatsBar({ connection }: { connection: string }) {
  return (
    <>
      {connection === '' ? (
        <div
          style={{
            display: 'flex',
            height: '40px',
            padding: 0,
            margin: 0,
            opacity: 1,
            alignItems: 'center',
            justifyContent: 'right',
            paddingRight: 1,
            paddingTop: 0,
            fontSize: 15,
            backgroundColor: 'var(--joy-palette-background-level1)',
          }}
        >
          <Link2Icon
            size={16}
            color="var(--joy-palette-danger-400)"
            style={{ marginBottom: '-3px' }}
          />
          &nbsp; Not Connected
        </div>
      ) : (
        <Box
          sx={{
            display: { xs: 'none', sm: 'none', md: 'flex' }, // Hide on everything below md
            height: '40px',
            padding: 0,
            margin: 0,
            opacity: 1,
            alignItems: 'center',
            justifyContent: 'right',
            paddingRight: 1,
            paddingTop: 0,
            fontSize: 15,
            backgroundColor: 'var(--joy-palette-background-level1)',
          }}
        >
          <Tooltip
            placement="top-end"
            variant="outlined"
            arrow
            title={
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxWidth: 320,
                  justifyContent: 'center',
                  p: 1,
                }}
              >
                <Box sx={{ display: 'flex', width: '100%', mt: 1 }}>
                  <Box>
                    {/* {JSON.stringify(server)} */}
                    <Stack gap={0}>
                      <Typography level="title-lg">{connection}</Typography>
                      <Typography>
                        <b>OS: </b>
                        {Array.isArray(server?.os_alias) && server.os_alias[0]}
                      </Typography>
                      <Typography>
                        <b>CPU: </b>
                        {server?.cpu}
                      </Typography>

                      {/* Mac-specific metrics */}
                      {server?.mac_metrics ? (
                        <>
                          <Typography>
                            <b>GPU 1: </b>
                            {server.mac_metrics.soc?.chip_name ||
                              'Mac Silicon GPU'}
                          </Typography>
                          {server.mac_metrics.gpu_usage && (
                            <Typography>
                              <b>GPU Usage: </b>
                              {(server.mac_metrics.gpu_usage[1] * 100).toFixed(
                                1,
                              )}
                              %
                            </Typography>
                          )}
                        </>
                      ) : (
                        // Regular GPU display for non-Mac systems
                        server?.gpu?.map((gpu, index) => (
                          <div key={index}>
                            <Typography>
                              <b>GPU {index + 1}: </b>
                              {gpu.name === 'cpu' ? 'N/A' : gpu.name}
                            </Typography>
                            <Typography>
                              <b>GPU Memory: </b>
                              {formatBytes(gpu.total_memory) === '0 Bytes'
                                ? 'N/A'
                                : formatBytes(gpu.total_memory)}
                            </Typography>
                          </div>
                        ))
                      )}
                      <Typography p={1}>
                        <ReactRouterLink to="/computer">
                          More about this computer
                        </ReactRouterLink>
                      </Typography>
                    </Stack>
                  </Box>
                </Box>
              </Box>
            }
          >
            <div style={{ whiteSpace: 'nowrap', marginLeft: '10px' }}>
              {/* <TinyCircle size={6} /> */}
              <Link2Icon
                size={16}
                color="var(--joy-palette-success-400)"
                style={{ marginBottom: '-3px' }}
              />
              &nbsp; Connected -
            </div>
          </Tooltip>
          <span style={{ display: 'flex', WebkitAppRegion: 'no-drag' } as any}>
            &nbsp;CPU:
            <div style={{ width: '60px', textAlign: 'center' }}>
              <div
                style={{ width: '60px', position: 'absolute', opacity: 0.6 }}
              >
                <Sparklines height={20} width={60} data={cs.cpu}>
                  <SparklinesLine color="green" />
                </Sparklines>
              </div>
              {cs.cpu[cs.cpu.length - 1]}%
            </div>{' '}
            RAM:{' '}
            <div style={{ width: '60px', textAlign: 'center' }}>
              <div
                style={{ width: '60px', position: 'absolute', opacity: 0.6 }}
              >
                <Sparklines height={20} width={60} data={cs.mem} max={100}>
                  <SparklinesLine color="#1c8cdc" />
                </Sparklines>
              </div>
              {Math.round(cs.mem[cs.mem.length - 1])}%
            </div>
            {showGPU()}
          </span>
        </Box>
      )}
    </>
  );
}

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
      {!isLocalMode ? (
        <Box sx={{ mr: 2 }} />
      ) : (
        <StatsBar connection={connection} />
      )}
      {showConnectionLostModal && (
        <ConnectionLostModal
          connection={connection}
          setConnection={setConnection}
        />
      )}
    </Sheet>
  );
}

function getBackgroundColor(percent) {
  if (percent > 80) {
    return 'rgba(255, 0, 0, 0.1)';
  }
  if (percent > 60) {
    return 'rgba(255, 255, 0, 0.1)';
  }
  return 'rgba(0, 255, 0, 0.1)';
}

function PercentWithColoredBackgroundMeter({ percent }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '38px',
        padding: '12px 0px 12px 5px',
        marginRight: '3px',
        height: '20px',
        backgroundColor: getBackgroundColor(percent),
      }}
    >
      {percent}%
    </div>
  );
}
