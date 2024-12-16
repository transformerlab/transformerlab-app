/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import {
  Box,
  Card,
  CardContent,
  FormControl,
  Grid,
  Input,
  LinearProgress,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
  Code2Icon,
  DatabaseIcon,
  LayoutIcon,
  MemoryStickIcon,
  SearchIcon,
  ZapIcon,
} from 'lucide-react';

import { SiNvidia } from 'react-icons/si';

import { BsGpuCard } from 'react-icons/bs';
import { FaComputer } from 'react-icons/fa6';

import { formatBytes } from 'renderer/lib/utils';

import { useServerStats } from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { FaPython } from 'react-icons/fa';

function ComputerCard({ children, title, description = '', chip = '', icon }) {
  return (
    <Card variant="soft">
      <CardContent>
        <Typography level="title-lg" startDecorator={icon}>
          {title}
        </Typography>
        <Typography level="title-sm">{description}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function StatRow({ title, value }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography level="title-md">{title}:</Typography>
      <Typography level="body-md">{value}</Typography>
    </Stack>
  );
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Computer() {
  const [searchText, setSearchText] = useState('');

  const { server, isLoading, isError } = useServerStats();

  const { data: pythonLibraries } = useSWR(
    chatAPI.Endpoints.ServerInfo.PythonLibraries(),
    fetcher
  );

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        paddingBottom: '10px',
        height: '100%',
        overflow: 'hidden',
        paddingTop: '1rem',
      }}
    >
      {server && (
        <>
          {/* {JSON.stringify(server)} */}
          <Typography level="h2" paddingBottom={3}>
            Server Information
          </Typography>
          <Sheet className="OrderTableContainer">
            <Grid container spacing={2} sx={{}}>
              <Grid xs={2}>
                <ComputerCard
                  icon={<FaComputer />}
                  title="Machine"
                  description={`${server.os} - ${server.name}`}
                >
                  <StatRow title="CPU" value={server?.cpu_percent + '%'} />
                  <StatRow title="Cores" value={server?.cpu_count} />
                </ComputerCard>
              </Grid>
              <Grid xs={4}>
                <ComputerCard
                  icon={<BsGpuCard />}
                  title={'GPU Specs (' + server.gpu?.length + ')'}
                  image={undefined}
                >
                  {server.gpu?.map((g, i) => {
                    return (
                      <Box mb={2}>
                        <Typography level="title-md">GPU # {i}</Typography>
                        {g.name.includes('NVIDIA') ? (
                          <SiNvidia color="#76B900" />
                        ) : (
                          '🔥'
                        )}
                        &nbsp;
                        {g.name}
                        <StatRow
                          title="Total VRAM"
                          value={formatBytes(g?.total_memory)}
                        />
                        <StatRow
                          title="Available"
                          value={formatBytes(g?.free_memory)}
                        />
                        {g.total_memory !== 'n/a' && (
                          <>
                            <StatRow
                              title="Used"
                              value={
                                <>
                                  {Math.round(
                                    (g?.used_memory / g?.total_memory) * 100
                                  )}
                                  %
                                  <LinearProgress
                                    determinate
                                    value={
                                      (g?.used_memory / g?.total_memory) * 100
                                    }
                                    variant="solid"
                                    sx={{ minWidth: '50px' }}
                                  />
                                </>
                              }
                            />
                          </>
                        )}
                      </Box>
                    );
                  })}
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<ZapIcon />} title="Acceleration">
                  <StatRow
                    title="GPU"
                    value={server.gpu?.length === 0 ? '❌' : '✅'}
                  />
                  <StatRow
                    title="CUDA"
                    value={server?.device === 'cuda' ? '✅ ' : '❌'}
                  />
                  <StatRow title="CUDA Version" value={server?.cuda_version} />{' '}
                  <StatRow
                    title="Python MPS"
                    value={server?.device === 'mps' ? '✅ ' : '❌'}
                  />{' '}
                  <StatRow
                    title="Flash Attention"
                    value={
                      server?.flash_attn_version &&
                      server?.flash_attn_version != 'n/a'
                        ? '✅'
                        : '❌'
                    }
                  />
                  <StatRow
                    title="Flash Attn Version"
                    value={server?.flash_attn_version}
                  />
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<LayoutIcon />} title="Operating System">
                  {server?.platform}
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<MemoryStickIcon />} title="Memory">
                  <>
                    <StatRow
                      title="Total"
                      value={formatBytes(server.memory?.total)}
                    />
                    <StatRow
                      title="Available"
                      value={formatBytes(server.memory?.available)}
                    />
                    <StatRow
                      title="Percent"
                      value={server.memory?.percent + '%'}
                    />
                  </>
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard title="Disk" icon={<DatabaseIcon />}>
                  <StatRow
                    title="Total"
                    value={formatBytes(server.disk?.total)}
                  />
                  <StatRow
                    title="Used"
                    value={formatBytes(server.disk?.used)}
                  />
                  <StatRow
                    title="Free"
                    value={formatBytes(server.disk?.free)}
                  />
                  <StatRow
                    title="Percent"
                    value={
                      <>
                        {server.disk?.percent}%
                        <LinearProgress
                          determinate
                          value={server.disk?.percent}
                          variant="solid"
                          sx={{ minWidth: '50px' }}
                        />
                      </>
                    }
                  />
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<FaPython />} title="Python Version">
                  {server.python_version}
                </ComputerCard>
              </Grid>
            </Grid>

            {/* <h3>System Properties in Electron</h3>

          <Button onClick={getSystemProperties}>
            Print all System Properties
          </Button>

          <br />
          <pre id="info" style={{ whiteSpace: 'pre-wrap' }} /> */}
          </Sheet>
        </>
      )}
      <Typography level="h2" paddingTop={2}>
        Installed Python Libraries
      </Typography>
      <Typography level="title-sm" paddingBottom={0}>
        Conda Environment: {server?.conda_environment} @ {server?.conda_prefix}
      </Typography>
      <FormControl size="sm" sx={{ width: '400px' }}>
        <Input
          placeholder="Search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          startDecorator={<SearchIcon />}
        />
      </FormControl>
      {pythonLibraries && (
        <>
          <Sheet sx={{ overflow: 'auto', width: 'fit-content' }}>
            <Table borderAxis="both" sx={{ width: 'auto' }}>
              <thead>
                <tr>
                  <th>Library</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {pythonLibraries
                  .filter((lib) =>
                    lib.name.toLowerCase().includes(searchText.toLowerCase())
                  )
                  .map((lib) => {
                    return (
                      <tr>
                        <td>{lib.name}</td>
                        <td>{lib.version}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </Sheet>
        </>
      )}
    </Sheet>
  );
}
