/* eslint-disable react/jsx-no-useless-fragment */
import Sheet from '@mui/joy/Sheet';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import {
  Box,
  Button,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useServerStats } from 'renderer/lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import { Link2Icon } from 'lucide-react';

import { formatBytes } from 'renderer/lib/utils';
import { Link as ReactRouterLink } from 'react-router-dom';
import ModelCurrentlyPlayingBar from './ModelCurrentlyPlayingBar';

import TinyMLXLogo from './Shared/TinyMLXLogo';
import TinyNVIDIALogo from './Shared/TinyNVIDIALogo';

function StatsBar({ connection, setConnection }) {
  const [cs, setCS] = useState({ cpu: [0], gpu: [0], mem: [0] });
  const { server, isLoading, isError } = useServerStats();

  useEffect(() => {
    if (connection === '') return;

    const newConnectionStats = { ...cs };

    // CPU Percent:
    if (server?.cpu_percent == null || Number.isNaN(server?.cpu_percent)) {
      newConnectionStats.cpu.push(0);
    } else {
      newConnectionStats.cpu.push(server?.cpu_percent);
    }
    if (newConnectionStats.cpu.length > 10) {
      newConnectionStats.cpu.shift();
    }

    // GPU Percent:
    const gpuPercent =
      (server?.gpu?.reduce((acc, gpu) => {
        if (gpu.total_memory && gpu.used_memory) {
          return acc + (gpu.used_memory / gpu.total_memory) * 100;
        }
        return acc;
      }, 0) ?? 0) / (server?.gpu?.length || 1);

    if (Number.isNaN(gpuPercent)) {
      newConnectionStats.gpu.push(0);
    } else {
      newConnectionStats.gpu.push(gpuPercent);
    }
    if (newConnectionStats.gpu.length > 10) {
      newConnectionStats.gpu.shift();
    }

    // Memory:
    if (
      server?.memory?.percent == null ||
      Number.isNaN(server?.memory?.percent)
    ) {
      newConnectionStats.mem.push(0);
    } else {
      newConnectionStats.mem.push(server?.memory?.percent);
    }

    if (newConnectionStats.mem.length > 10) {
      newConnectionStats.mem.shift();
    }

    setCS(newConnectionStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, server]);

  // The following effect checks if the server is returning "error"
  // and if so, it resets the connection in order to force the user to
  // re-connect
  useEffect(() => {
    if (isError) {
      setConnection('');
    }
  }, [isError]);

  function showGPU() {
    if (server?.os == 'Darwin' && server?.cpu == 'arm64') {
      return (
        <span style={{ opacity: 0.6 }}>
          {' '}
          <TinyMLXLogo />
        </span>
      );
    }

    return (
      <Tooltip
        title={showDetailedVRAM()}
        placement="top"
        arrow
        sx={{ fontSize: 12 }}
        variant="outlined"
      >
        <span id="hoo">
          <Stack gap={0} direction="row">
            VRAM:
            <div style={{ width: '60px', textAlign: 'center' }}>
              <div
                style={{ width: '60px', position: 'absolute', opacity: 0.6 }}
              >
                <Sparklines height={20} width={60} data={cs.gpu}>
                  <SparklinesLine color="var(--joy-palette-danger-500)" />
                </Sparklines>
              </div>
              {Math.round(cs.gpu[cs.gpu.length - 1])}%
            </div>{' '}
            GPU:{' '}
            {server?.gpu?.map((gpu, index) => (
              <PercentWithColoredBackgroundMeter
                key={index}
                percent={Math.round(gpu?.utilization)}
              />
            ))}
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {server?.device == 'cuda' && <TinyNVIDIALogo />}
            </span>
          </Stack>
        </span>
      </Tooltip>
    );
  }

  function showDetailedVRAM() {
    // if gpu?.total_memory == 'n/a" then quit:
    if (server?.gpu?.[0]?.total_memory === 'n/a') {
      return ' ';
    }

    return (
      <>
        {server?.gpu?.map((gpuDetail, index) => (
          <div key={index} style={{ marginBottom: '10px' }}>
            <Typography level="title-sm">GPU {index + 1}:</Typography>
            <div>Total VRAM: {formatBytes(gpuDetail?.total_memory)}</div>
            <div>Used VRAM: {formatBytes(gpuDetail?.used_memory)}</div>
            <div>Free VRAM: {formatBytes(gpuDetail?.free_memory)}</div>
            <LinearProgress
              determinate
              value={(gpuDetail?.used_memory / gpuDetail?.total_memory) * 100}
              variant="solid"
              sx={{ minWidth: '50px' }}
            />
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {isError ? (
        <div
          style={{
            display: 'flex',
            height: '40px',
            padding: 0,
            margin: 0,
            opacity: 1,
            alignItems: 'center',
            justifyContent: 'right',
            paddingRight: 20,
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
        <div
          style={{
            display: 'flex',
            height: '40px',
            padding: 0,
            margin: 0,
            opacity: 1,
            alignItems: 'center',
            justifyContent: 'right',
            paddingRight: 20,
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
                        {server?.os_alias[0]}
                      </Typography>
                      <Typography>
                        <b>CPU: </b>
                        {server?.cpu}
                      </Typography>
                      {server?.gpu?.map((gpu, index) => (
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
                      ))}
                      <Typography p={1}>
                        <ReactRouterLink to="/computer">
                          More about this computer
                        </ReactRouterLink>
                      </Typography>

                      <Button
                        variant="solid"
                        color="danger"
                        size="small"
                        sx={{ m: 0, p: 1 }}
                        onClick={() => {
                          setConnection('');
                        }}
                      >
                        Disconnect
                      </Button>
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
          <span style={{ display: 'flex', '-webkit-app-region': 'no-drag' }}>
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
        </div>
      )}
    </>
  );
}

export default function Header({ connection, setConnection, experimentInfo }) {
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
        style={{
          height: '100%',
          flex: 1,
          // border: '1px solid purple',
          '-webkit-app-region': 'drag',
        }}
      />
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
      <div
        style={{
          height: '100%',
          flex: 1,
          // border: '1px solid purple',
          '-webkit-app-region': 'drag',
        }}
      />
      <StatsBar connection={connection} setConnection={setConnection} />
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
