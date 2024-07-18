import Sheet from '@mui/joy/Sheet';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { Box, Button, Stack, Tooltip, Typography } from '@mui/joy';
import { useServerStats } from 'renderer/lib/transformerlab-api-sdk';
import { useEffect, useState } from 'react';
import { Link2Icon } from 'lucide-react';

import { formatBytes } from 'renderer/lib/utils';
import ModelCurrentlyPlayingBar from './ModelCurrentlyPlayingBar';

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
      // eslint-disable-next-line no-unsafe-optional-chaining
      (server?.gpu?.[0]?.used_memory / server?.gpu?.[0]?.total_memory) * 100;

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
                <Box sx={{ display: 'flex', gap: 1, width: '100%', mt: 1 }}>
                  <Box>
                    <Typography
                      textColor="text.secondary"
                      fontSize="sm"
                      sx={{ mb: 1 }}
                    >
                      {/* {JSON.stringify(server)} */}
                      <Stack>
                        <Typography fontSize="sm">{connection}</Typography>
                        <Typography>
                          <b>OS: </b>
                          {server?.os_alias[0]}
                        </Typography>
                        <Typography>
                          <b>CPU: </b>
                          {server?.cpu}
                        </Typography>
                        <Typography>
                          <b>GPU: </b>
                          {server?.gpu[0].name}
                        </Typography>
                        <Typography>
                          <b>GPU Memory: </b>
                          {formatBytes(server?.gpu[0].total_memory)}
                        </Typography>
                      </Stack>
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
                  </Box>
                </Box>
              </Box>
            }
          >
            <div>
              {/* <TinyCircle size={6} /> */}
              <Link2Icon
                size={16}
                color="var(--joy-palette-success-400)"
                style={{ marginBottom: '-3px' }}
              />
              &nbsp; Connected -
            </div>
          </Tooltip>
          &nbsp;CPU:
          <div style={{ width: '60px', textAlign: 'center' }}>
            <div style={{ width: '60px', position: 'absolute', opacity: 0.6 }}>
              <Sparklines height={20} width={60} data={cs.cpu}>
                <SparklinesLine color="green" />
              </Sparklines>
            </div>
            {cs.cpu[cs.cpu.length - 1]}%
          </div>{' '}
          RAM:{' '}
          <div style={{ width: '60px', textAlign: 'center' }}>
            <div style={{ width: '60px', position: 'absolute', opacity: 0.6 }}>
              <Sparklines height={20} width={60} data={cs.mem} max={100}>
                <SparklinesLine color="#1c8cdc" />
              </Sparklines>
            </div>
            {Math.round(cs.mem[cs.mem.length - 1])}%
          </div>
          VRAM:
          <div style={{ width: '60px', textAlign: 'center' }}>
            <div style={{ width: '60px', position: 'absolute', opacity: 0.6 }}>
              <Sparklines height={20} width={60} data={cs.gpu}>
                <SparklinesLine color="var(--joy-palette-danger-500)" />
              </Sparklines>
            </div>
            {Math.round(cs.gpu[cs.gpu.length - 1])}%
          </div>{' '}
          <div style={{ minWidth: '80px' }}>
            GPU:&nbsp;
            {/* <div style={{ width: '60px', textAlign: 'center' }}>
              <div
                style={{ width: '60px', position: 'absolute', opacity: 0.6 }}
              >
                <Sparklines height={20} width={60} data={cs.gpu}>
                  <SparklinesLine color="red" />
                </Sparklines>
              </div>
              {Math.round(cs.gpu[cs.gpu.length - 1])} %
            </div>{' '} */}
            {server?.gpu?.[0]?.utilization > 40 ? (
              <span
                style={{ backgroundColor: 'var(--joy-palette-danger-100)' }}
              >
                {server?.gpu?.[0]?.utilization} %
              </span>
            ) : (
              <span
                style={{
                  backgroundColor: 'rgb(0,128,0,0.1)',
                  paddingRight: '3px',
                  paddingLeft: '3px',
                }}
              >
                {server?.gpu?.[0]?.utilization} %
              </span>
            )}
          </div>
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
          '-webkit-app-region': 'drag',
        }}
      >
        <ModelCurrentlyPlayingBar experimentInfo={experimentInfo} />
      </div>

      <StatsBar connection={connection} setConnection={setConnection} />
    </Sheet>
  );
}
