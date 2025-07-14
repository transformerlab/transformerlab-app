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
  Tab,
  Table,
  TabList,
  TabPanel,
  Tabs,
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
import { FaComputer, FaW, FaApple } from 'react-icons/fa6';
import { FaWindows } from 'react-icons/fa6';
import { FaLinux } from 'react-icons/fa6';

import { formatBytes } from 'renderer/lib/utils';

import { useServerStats, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { useState } from 'react';

import { FaPython } from 'react-icons/fa';

function ComputerCard({ children, title, description = '', chip = '', icon }) {
  return (
    <Card variant="soft" sx={{ maxHeight: '500px', overflowY: 'auto' }}>
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

  const { data: pythonLibraries } = useAPI('server', ['pythonLibraries']);

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}
    >
      <Tabs
        sx={{
          height: '100%',
          display: 'block',
          overflow: 'hidden',
        }}
      >
        <TabList>
          <Tab>Server Information</Tab>
          <Tab>Python Libraries</Tab>
        </TabList>
        <TabPanel
          value={0}
          sx={{
            overflow: 'hidden',
            height: '100%',
          }}
        >
          {server && (
            <Sheet
              sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                paddingBottom: '1rem',
              }}
            >
              {/* {JSON.stringify(server)} */}
              <Typography level="h2" paddingBottom={1}>
                Server Information
              </Typography>
              <Sheet
                className="OrderTableContainer"
                sx={{
                  display: 'flex',
                  height: '100%',
                  overflowY: 'auto',
                  padding: '10px',
                }}
              >
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

                  {/* Mac metrics card replaces GPU specs */}
                  {server.mac_metrics ? (
                    <Grid xs={4}>
                      <ComputerCard
                        icon={<FaApple />}
                        title="Mac Monitoring Metrics"
                        sx={{ maxHeight: 'none', overflowY: 'visible' }}
                      >
                        {server.mac_metrics.soc && (
                          <>
                            <Typography level="title-sm" mb={1}>
                              System on Chip (SoC)
                            </Typography>
                            <StatRow
                              title="Chip"
                              value={server.mac_metrics.soc.chip_name}
                            />
                            <StatRow
                              title="Mac Model"
                              value={server.mac_metrics.soc.mac_model}
                            />
                            <StatRow
                              title="Memory"
                              value={`${server.mac_metrics.soc.memory_gb} GB`}
                            />
                            <StatRow
                              title="CPU Cores"
                              value={`${server.mac_metrics.soc.ecpu_cores} E-cores, ${server.mac_metrics.soc.pcpu_cores} P-cores`}
                            />
                            <StatRow
                              title="GPU Cores"
                              value={server.mac_metrics.soc.gpu_cores}
                            />
                            <StatRow
                              title="CPU Frequencies"
                              value={`${Math.min(...server.mac_metrics.soc.ecpu_freqs)} - ${Math.max(...server.mac_metrics.soc.ecpu_freqs)} MHz (E), ${Math.min(...server.mac_metrics.soc.pcpu_freqs)} - ${Math.max(...server.mac_metrics.soc.pcpu_freqs)} MHz (P)`}
                            />
                            <StatRow
                              title="GPU Frequencies"
                              value={`${Math.min(...server.mac_metrics.soc.gpu_freqs.filter((f: number) => f > 0))} - ${Math.max(...server.mac_metrics.soc.gpu_freqs)} MHz`}
                            />
                          </>
                        )}

                        <Typography level="title-sm" mt={2} mb={1}>
                          Usage
                        </Typography>
                        {server.mac_metrics.ecpu_usage && (
                          <StatRow
                            title="ECPU Usage"
                            value={`${server.mac_metrics.ecpu_usage[0]} MHz, ${(server.mac_metrics.ecpu_usage[1] * 100).toFixed(2)}%`}
                          />
                        )}
                        {server.mac_metrics.pcpu_usage && (
                          <StatRow
                            title="PCPU Usage"
                            value={`${server.mac_metrics.pcpu_usage[0]} MHz, ${(server.mac_metrics.pcpu_usage[1] * 100).toFixed(2)}%`}
                          />
                        )}
                        {server.mac_metrics.gpu_usage && (
                          <StatRow
                            title="GPU Usage"
                            value={`${server.mac_metrics.gpu_usage[0]} MHz, ${(server.mac_metrics.gpu_usage[1] * 100).toFixed(2)}%`}
                          />
                        )}

                        <Typography level="title-sm" mt={2} mb={1}>
                          Temperature
                        </Typography>
                        <StatRow
                          title="CPU Temperature"
                          value={`${server.mac_metrics.temp?.cpu_temp_avg.toFixed(2)}°C`}
                        />
                        <StatRow
                          title="GPU Temperature"
                          value={`${server.mac_metrics.temp?.gpu_temp_avg.toFixed(2)}°C`}
                        />

                        <Typography level="title-sm" mt={2} mb={1}>
                          Power Consumption
                        </Typography>
                        <StatRow
                          title="Total Power"
                          value={`${server.mac_metrics.all_power.toFixed(2)} W`}
                        />
                        <StatRow
                          title="CPU Power"
                          value={`${server.mac_metrics.cpu_power.toFixed(2)} W`}
                        />
                        <StatRow
                          title="GPU Power"
                          value={`${server.mac_metrics.gpu_power.toFixed(2)} W`}
                        />
                        <StatRow
                          title="RAM Power"
                          value={`${server.mac_metrics.ram_power.toFixed(2)} W`}
                        />
                        <StatRow
                          title="System Power"
                          value={`${server.mac_metrics.sys_power.toFixed(2)} W`}
                        />
                      </ComputerCard>
                    </Grid>
                  ) : (
                    <Grid xs={4}>
                      <ComputerCard
                        icon={<BsGpuCard />}
                        title={'GPU Specs (' + server.gpu?.length + ')'}
                        image={undefined}
                      >
                        {server.gpu?.map((g, i) => {
                          return (
                            <Box mb={2}>
                              <Typography level="title-md">
                                GPU # {i}
                              </Typography>
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
                                          (g?.used_memory / g?.total_memory) *
                                            100,
                                        )}
                                        %
                                        <LinearProgress
                                          determinate
                                          value={
                                            (g?.used_memory / g?.total_memory) *
                                            100
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
                  )}
                  <Grid xs={3}>
                    <ComputerCard icon={<ZapIcon />} title="Acceleration">
                      <StatRow
                        title="GPU"
                        value={server.gpu?.length === 0 ? '❌' : '✅'}
                      />
                      <StatRow
                        title={server?.device_type !== 'amd' ? 'CUDA' : 'ROCm'}
                        value={server?.device === 'cuda' ? '✅ ' : '❌'}
                      />
                      <StatRow
                        title={
                          server?.device_type !== 'amd'
                            ? 'CUDA Version'
                            : 'ROCm Version'
                        }
                        value={server?.cuda_version}
                      />{' '}
                      <StatRow
                        title="Python MPS"
                        value={server?.device === 'mps' ? '✅ ' : '❌'}
                      />{' '}
                      {/* <StatRow
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
                      /> */}
                    </ComputerCard>
                  </Grid>
                  <Grid xs={3}>
                    <ComputerCard
                      icon={<LayoutIcon />}
                      title="Operating System"
                    >
                      {server?.platform.includes('microsoft') && <FaWindows />}
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
              </Sheet>
            </Sheet>
          )}
        </TabPanel>
        <TabPanel
          value={1}
          style={{
            height: '100%',
            overflow: 'auto',
          }}
        >
          <Sheet
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '90%',
              overflow: 'hidden',
              gap: '1rem',
            }}
          >
            <Typography level="h2" paddingTop={0}>
              Installed Python Libraries
            </Typography>
            <Typography level="title-sm" paddingBottom={0}>
              Conda Environment: {server?.conda_environment} @{' '}
              {server?.conda_prefix}
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
                          lib.name
                            .toLowerCase()
                            .includes(searchText.toLowerCase()),
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
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
