/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import {
  FormControl,
  FormLabel,
  Input,
  Select,
  Sheet,
  Table,
  Typography,
  Option,
  Chip,
  Link,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
} from '@mui/joy';
import {
  ArrowDownIcon,
  CheckIcon,
  CreativeCommonsIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  SearchIcon,
} from 'lucide-react';
import { downloadModelFromGallery } from 'renderer/lib/transformerlab-api-sdk';

import useSWR from 'swr';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import TinyMLXLogo from '../Shared/TinyMLXLogo';

import {
  modelTypes,
  licenseTypes,
  filterByFilters,
  clamp,
  formatBytes,
} from '../../lib/utils';

function tryJSON(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

type Order = 'asc' | 'desc';

function getComparator<Key extends keyof any>(
  order: Order,
  orderBy: Key
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string }
) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

// Since 2020 all major browsers ensure sort stability with Array.prototype.sort().
// stableSort() brings sort stability to non-modern browsers (notably IE11). If you
// only support modern browsers you can replace stableSort(exampleArray, exampleComparator)
// with exampleArray.slice().sort(exampleComparator)
function stableSort<T>(
  array: readonly T[],
  comparator: (a: T, b: T) => number
) {
  const stabilizedThis = array.map((el, index) => [el, index] as [T, number]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ModelStore() {
  const [order, setOrder] = useState<Order>('desc');
  const [jobId, setJobId] = useState(null);
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const {
    data: modelGalleryData,
    error: modelGalleryError,
    isLoading: modelGalleryIsLoading,
    mutate: modelGalleryMutate,
  } = useSWR(chatAPI.Endpoints.Models.Gallery(), fetcher);

  const {
    data: localModelsData,
    error: localModelsError,
    isLoading: localModelsIsLoading,
    mutate: localModelsMutate,
  } = useSWR(chatAPI.Endpoints.Models.LocalList(), fetcher);

  const { data: modelDownloadProgress } = useSWR(
    currentlyDownloading && jobId != '-1'
      ? chatAPI.Endpoints.Jobs.Get(jobId)
      : null,
    fetcher,
    { refreshInterval: 2000 }
  );

  const renderFilters = () => (
    <>
      <FormControl size="sm">
        <FormLabel>License</FormLabel>
        <Select
          placeholder="Filter by license"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
          value={filters?.license}
          onChange={(e, newValue) => {
            setFilters({ ...filters, license: newValue });
          }}
        >
          {licenseTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
      <FormControl size="sm">
        <FormLabel>Architecture</FormLabel>
        <Select
          placeholder="All"
          value={filters?.architecture}
          onChange={(e, newValue) => {
            setFilters({ ...filters, architecture: newValue });
          }}
        >
          {modelTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
    </>
  );
  return (
    <>
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          py: 2,
          display: {
            xs: 'flex',
            sm: 'flex',
          },
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: {
              xs: '120px',
              md: '160px',
            },
          },
        }}
      >
        <FormControl sx={{ flex: 1 }} size="sm">
          <FormLabel>&nbsp;</FormLabel>
          <Input
            placeholder="Search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        {renderFilters()}
      </Box>
      <Sheet
        className="OrderTableContainer"
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 'md',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          height: '100%',
        }}
      >
        <Table
          aria-labelledby="tableTitle"
          stickyHeader
          hoverRow
          sx={{
            '--TableCell-headBackground': (theme) =>
              theme.vars.palette.background.level1,
            '--Table-headerUnderlineThickness': '1px',
            '--TableRow-hoverBackground': (theme) =>
              theme.vars.palette.background.level1,
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 100, padding: 12 }}>
                <Link
                  underline="none"
                  color="primary"
                  component="button"
                  onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                  fontWeight="lg"
                  endDecorator={<ArrowDownIcon />}
                  sx={{
                    '& svg': {
                      transition: '0.2s',
                      transform:
                        order === 'desc' ? 'rotate(0deg)' : 'rotate(180deg)',
                    },
                  }}
                >
                  Name
                </Link>
              </th>

              <th style={{ width: 50, padding: 12 }}>Params</th>
              <th style={{ width: 80, padding: 12 }}>License</th>
              <th style={{ width: 50, padding: 12 }}>Engine</th>
              <th style={{ width: 200, padding: 12 }}>Description</th>
              <th style={{ width: 30, padding: 12 }}>Size</th>
              <th style={{ width: 80, padding: 12 }}> </th>
            </tr>
          </thead>
          <tbody>
            {modelGalleryData &&
              stableSort(
                filterByFilters(modelGalleryData, searchText, filters),
                getComparator(order, 'name')
              ).map((row) => (
                <tr key={row.uniqueID}>
                  <td>
                    <Typography level="title-md" marginLeft={2}>
                      {row.name}&nbsp;
                      <a href={row?.resources?.canonicalUrl} target="_blank">
                        <ExternalLinkIcon size="14px" />
                      </a>
                    </Typography>
                  </td>
                  <td>{row.parameters}</td>
                  <td>
                    <Chip
                      variant="soft"
                      size="sm"
                      startDecorator={
                        {
                          GPL: <CheckIcon />,
                          'Apache 2.0': <GraduationCapIcon />,
                          CC: <CreativeCommonsIcon />,
                        }[row.license]
                      }
                      color={
                        {
                          GPL: 'success',
                          'Apache 2.0': 'neutral',
                          CC: 'success',
                        }[row.license]
                      }
                    >
                      {row.license}
                    </Chip>
                  </td>
                  <td
                    style={{
                      overflow: 'hidden',
                      color:
                        row.architecture == 'GGUF'
                          ? 'var(--joy-palette-success-800)'
                          : '',
                    }}
                  >
                    {row.architecture == 'MLX' && (
                      <>
                        <TinyMLXLogo />
                        &nbsp;
                      </>
                    )}
                    {row.architecture}
                  </td>
                  <td>
                    <div style={{ maxHeight: '60px', overflow: 'hidden' }}>
                      {/* {JSON.stringify(row)} */}
                      {row.description}
                    </div>
                  </td>

                  <td>
                    {row?.size_of_model_in_mb &&
                      formatBytes(row?.size_of_model_in_mb * 1024 * 1024)}
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <Button
                      size="sm"
                      disabled={row.downloaded || currentlyDownloading !== null}
                      onClick={async () => {
                        setJobId(-1);
                        setCurrentlyDownloading(row.name);
                        try {
                          let response = await fetch(
                            chatAPI.Endpoints.Jobs.Create()
                          );
                          const newJobId = await response.json();
                          setJobId(newJobId);
                          response = await downloadModelFromGallery(
                            row?.uniqueID,
                            newJobId
                          );
                          if (response?.status == 'error') {
                            setCurrentlyDownloading(null);
                            setJobId(null);
                            return alert(
                              `Failed to download:\n${response.message}` 
                            );
                          }
                          setCurrentlyDownloading(null);
                          modelGalleryMutate();
                        } catch (e) {
                          setCurrentlyDownloading(null);
                          setJobId(null);
                          console.log(e);
                          return alert('Failed to download');
                        }
                      }}
                      startDecorator={
                        jobId && currentlyDownloading == row.name ? (
                          <>
                            {row?.size_of_model_in_mb ? (
                              <>
                                <LinearProgress
                                  determinate
                                  value={clamp(
                                    modelDownloadProgress?.progress,
                                    0,
                                    100
                                  )}
                                  sx={{ width: '100px' }}
                                  variant="solid"
                                />
                                &nbsp;&nbsp;
                                {modelDownloadProgress?.progress !== -1 && (
                                  <>
                                    {clamp(
                                      Number.parseFloat(
                                        modelDownloadProgress?.progress
                                      ),
                                      0,
                                      100
                                    ).toFixed(0)}
                                    %
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <LinearProgress
                                  sx={{ width: '40px' }}
                                  variant="solid"
                                />
                                &nbsp;&nbsp;
                                {formatBytes(
                                  tryJSON(modelDownloadProgress?.job_data)
                                    ?.downloaded *
                                    1024 *
                                    1024
                                )}
                                {/* {modelDownloadProgress?.job_data} */}
                                <ArrowDownIcon size="18px" />
                              </>
                            )}
                          </>
                        ) : (
                          ''
                        )
                      }
                      endDecorator={
                        jobId && currentlyDownloading == row.name ? (
                          ''
                        ) : row.downloaded ? (
                          <CheckIcon size="18px" />
                        ) : (
                          <DownloadIcon size="18px" />
                        )
                      }
                    >
                      {jobId && currentlyDownloading == row.name ? (
                        ''
                      ) : (
                        <>Download{row.downloaded ? 'ed' : ''}</>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Sheet>
    </>
  );
}
