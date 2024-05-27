/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import {
  Card,
  CardContent,
  Chip,
  FormControl,
  FormLabel,
  Grid,
  Input,
  Table,
  Typography,
} from '@mui/joy';

import {
  CalculatorIcon,
  Code2Icon,
  DatabaseIcon,
  FlameIcon,
  GridIcon,
  LayoutIcon,
  MemoryStickIcon,
  RouterIcon,
  SearchIcon,
} from 'lucide-react';

import { BsGpuCard } from 'react-icons/bs';
import { FaComputer } from 'react-icons/fa6';
import { PiMathOperationsFill } from 'react-icons/pi';

import { formatBytes } from 'renderer/lib/utils';

import { useServerStats } from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

function getSystemProperties() {
  const information = document.getElementById('info');
  information.innerText = `This app is using Chrome (v${window.platform.chrome()}), Node.js (v${window.platform.node()}), and Electron (v${window.platform.electron()})`;
}

function ComputerCard({ children, title, description = '', chip = '', icon }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          level="h2"
          fontSize="lg"
          id="card-description"
          mb={0.5}
          startDecorator={icon}
        >
          {title}
        </Typography>
        <Typography fontSize="sm" aria-describedby="card-description" mb={1}>
          {description}
        </Typography>
        {children}
        {chip !== '' && (
          <Chip
            variant="outlined"
            color="primary"
            size="sm"
            sx={{ pointerEvents: 'none' }}
          >
            {chip}
          </Chip>
        )}
      </CardContent>
    </Card>
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
              <Grid xs={4}>
                <ComputerCard
                  icon={<FaComputer />}
                  title="Machine"
                  description={`${server.os} - ${server.name}`}
                >
                  CPU: {server.cpu_percent}%<br />
                  {server.cpu_count} Cores
                </ComputerCard>
              </Grid>{' '}
              <Grid xs={2}>
                <ComputerCard icon={<PiMathOperationsFill />} title="Device">
                  GPU: {server.gpu?.length === 0 ? '❌' : '✅'}
                  <br />
                  CUDA: {server?.device === 'cuda' ? '✅ ' : '❌ '}
                  <br />
                  CUDA Version: {server?.cuda_version}
                  <br />
                  Python MPS: {server?.device === 'mps' ? '✅ ' : '❌ '}
                </ComputerCard>
              </Grid>{' '}
              <Grid xs={4}>
                <ComputerCard
                  icon={<BsGpuCard />}
                  title="GPU Specs"
                  image={undefined}
                >
                  {server.gpu?.map((g) => {
                    return (
                      <>
                        🔥 {g.name}
                        <br />
                        {formatBytes(Math.round(g?.used_memory))} Used
                        <br />
                        {formatBytes(g.total_memory)} Total
                      </>
                    );
                  })}
                  <br />
                  Used Memory:{' '}
                  {Math.round(
                    server.gpu[0]?.used_memory / server.gpu[0]?.total_memory
                  )}
                  %
                </ComputerCard>
              </Grid>{' '}
              <Grid xs={3}>
                <ComputerCard icon={<LayoutIcon />} title="Operating System">
                  {server?.platform}
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<MemoryStickIcon />} title="Memory">
                  <>
                    <Typography>
                      Total Memory: {formatBytes(server.memory?.total)}
                    </Typography>
                    <Typography>
                      Available: {formatBytes(server.memory?.available)}
                    </Typography>
                    <Typography>Percent: {server.memory?.percent}%</Typography>
                  </>
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard title="Disk" icon={<DatabaseIcon />}>
                  Total: {formatBytes(server.disk?.total)} - Used:{' '}
                  {formatBytes(server.disk?.free)} - Free:{' '}
                  {server.disk?.percent}%
                </ComputerCard>
              </Grid>
              <Grid xs={3}>
                <ComputerCard icon={<Code2Icon />} title="Python Version">
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
      <Typography level="h2" paddingBottom={0}>
        Installed Python Libraries
      </Typography>
      <FormControl size="sm">
        <FormLabel>&nbsp;</FormLabel>
        <Input
          placeholder="Search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          startDecorator={<SearchIcon />}
        />
      </FormControl>
      {pythonLibraries && (
        <>
          <Sheet sx={{ overflow: 'auto' }}>
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
