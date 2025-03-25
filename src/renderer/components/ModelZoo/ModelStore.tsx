/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

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
  LinearProgress,
} from '@mui/joy';
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronUpIcon,
  CreativeCommonsIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  InfoIcon,
  LockKeyholeIcon,
  SearchIcon,
} from 'lucide-react';
import { downloadModelFromGallery } from 'renderer/lib/transformerlab-api-sdk';

import useSWR from 'swr';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import ModelDetailsModal from './ModelDetailsModal';
import ImportModelsBar from './ImportModelsBar';
import DownloadProgressBox from '../Shared/DownloadProgressBox';

import {
  modelTypes,
  licenseTypes,
  filterByFilters,
  clamp,
  formatBytes,
} from '../../lib/utils';

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
  orderBy: Key,
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string },
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
  comparator: (a: T, b: T) => number,
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

// returns a URL to the model on HuggingFace based on repo name
function getModelHuggingFaceURL(model) {
  const repo_id = model.huggingface_repo ? model.huggingface_repo : model.id;
  return 'https://huggingface.co/' + repo_id;
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ModelStore() {
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState('name');
  // jobId is null if there is no current download in progress,
  // and it is -1 if a download has been initiated but it hasn't started yet
  const [jobId, setJobId] = useState(null);
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [modelDetailsId, setModelDetailsId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({ archived: false });
  const navigate = useNavigate();

  const {
    data: modelGalleryData,
    error: modelGalleryError,
    isLoading: modelGalleryIsLoading,
    mutate: modelGalleryMutate,
  } = useSWR(chatAPI.Endpoints.Models.Gallery(), fetcher);

  const { data: modelDownloadProgress } = useSWR(
    jobId && jobId != '-1' ? chatAPI.Endpoints.Jobs.Get(jobId) : null,
    fetcher,
    { refreshInterval: 2000 },
  );

  // Creating a separate object to get useEffect for download jobs to work
  // useEffect needs it to be the exact same object, not just the same values
  const obj = useMemo(() => ({ currentlyDownloading }), [currentlyDownloading]);

  // check if we have a Hugging Face access token
  const { data: hftoken } = useSWR(
    chatAPI.Endpoints.Config.Get('HuggingfaceUserAccessToken'),
    fetcher,
  );

  const { data: canLogInToHuggingFace } = useSWR(
    chatAPI.Endpoints.Models.HuggingFaceLogin(),
    fetcher,
  );

  // Set isHFAccessTokenSet to true if message in canLogInToHuggingFace is 'OK'
  const isHFAccessTokenSet = canLogInToHuggingFace?.message === 'OK';

  // const isHFAccessTokenSet = hftoken && hftoken.length > 0;

  // On page load, check if there are any models currently being downloaded, and if so,
  // Record the jobID and model Name
  useEffect(() => {
    console.log(obj);
    fetch(chatAPI.Endpoints.Jobs.GetJobsOfType('DOWNLOAD_MODEL', 'RUNNING'))
      .then(async (response) => {
        const jobs = await response.json();
        if (jobs.length) {
          setJobId(jobs[0]?.id);
          jobs[0]?.job_data?.model
            ? setCurrentlyDownloading(jobs[0]?.job_data?.model)
            : setCurrentlyDownloading('Unknown');
        }
      })
      .catch((e) => {
        console.log(e);
      });
  }, [obj]);

  useEffect(() => {
    if (currentlyDownloading?.status == 'COMPLETE') {
      setCurrentlyDownloading(null);
      setJobId(null);
      modelGalleryMutate();
    }
  }, [modelDownloadProgress]);

  const renderFilters = () => (
    <>
      <FormControl size="sm">
        <FormLabel>Status</FormLabel>
        <Select
          placeholder="Hide Archived"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
          value={filters?.archived}
          onChange={(e, newValue) => {
            setFilters({ ...filters, archived: newValue });
          }}
        >
          <Option value={false}>Hide Archived</Option>
          <Option value="All">Show Archived</Option>
        </Select>
      </FormControl>
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
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          margin: '0.5rem 0 1rem 0',
          width: '100%',
        }}
      >
        <DownloadProgressBox jobId={jobId} assetName={currentlyDownloading} />
        {jobId && (
          <Button
            variant="outlined"
            size="sm"
            color="danger"
            disabled={canceling}
            onClick={async () => {
              setCanceling(true);
              try {
                let response = await fetch(chatAPI.Endpoints.Jobs.Stop(jobId));
                if (response.ok) {
                  setJobId(null);
                  setCurrentlyDownloading(null);
                } else {
                  console.error('Failed to cancel download:', response);
                  alert('Failed to cancel download');
                  setCanceling(false);
                }
              } catch (error) {
                console.error('Error canceling download:', error);
                alert('Error canceling download');
                setCanceling(false);
              }
            }}
            sx={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              fontSize: '0.75rem',
              padding: '0.25rem 0.5rem',
            }}
          >
            {canceling ? 'Stopping..' : 'Cancel Download'}
          </Button>
        )}
      </Box>
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          pb: 2,
          display: 'flex',
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
      <ModelDetailsModal
        modelId={modelDetailsId}
        setModelId={setModelDetailsId}
      />
      <Sheet
        className="OrderTableContainer"
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 'md',
          overflow: 'auto',
          minHeight: 0,
          height: '100%',
        }}
      >
        {modelGalleryIsLoading ? (
          <LinearProgress />
        ) : (
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
                <th style={{ width: 200, padding: 12 }}>
                  <Link
                    underline="none"
                    color="primary"
                    component="button"
                    onClick={() => {
                      setOrder(order === 'asc' ? 'desc' : 'asc');
                      setOrderBy('name');
                    }}
                    fontWeight="lg"
                    endDecorator={
                      <ChevronUpIcon
                        color={
                          orderBy == 'name'
                            ? 'var(--joy-palette-primary-plainColor)'
                            : 'var(--joy-palette-primary-plainDisabledColor)'
                        }
                      />
                    }
                    sx={{
                      marginLeft: 2,
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

                <th style={{ width: 100, padding: 12 }}>License</th>
                <th style={{ width: 100, padding: 12 }}>Engine</th>
                <th style={{ width: 60, padding: 12 }}>
                  {' '}
                  <Link
                    underline="none"
                    color="primary"
                    component="button"
                    onClick={() => {
                      setOrder(order === 'asc' ? 'desc' : 'asc');
                      setOrderBy('size_of_model_in_mb');
                    }}
                    fontWeight="lg"
                    endDecorator={
                      <ChevronUpIcon
                        color={
                          orderBy == 'size_of_model_in_mb'
                            ? 'var(--joy-palette-primary-plainColor)'
                            : 'var(--joy-palette-primary-plainDisabledColor)'
                        }
                      />
                    }
                    sx={{
                      '& svg': {
                        transition: '0.2s',
                        transform:
                          order === 'desc' ? 'rotate(0deg)' : 'rotate(180deg)',
                      },
                    }}
                  >
                    Size
                  </Link>
                </th>
                <th style={{ width: 20, padding: 12 }}> </th>
                <th style={{ width: 80, padding: 12 }}> </th>
              </tr>
            </thead>
            <tbody>
              {modelGalleryData &&
                stableSort(
                  filterByFilters(modelGalleryData, searchText, filters),
                  getComparator(order, orderBy),
                ).map((row) => (
                  <tr key={row.uniqueID}>
                    <td>
                      <Typography level="body-sm" marginLeft={2}>
                        {row.new && (
                          <Chip
                            variant="outlined"
                            size="sm"
                            color="warning"
                            sx={{ marginRight: '0.2rem' }}
                          >
                            New!
                          </Chip>
                        )}
                        {row.name}&nbsp;
                        <a
                          href={getModelHuggingFaceURL(row)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.gated ? (
                            <Chip
                              variant="outlined"
                              size="sm"
                              endDecorator={<LockKeyholeIcon size="13px" />}
                              color="warning"
                            >
                              Gated
                            </Chip>
                          ) : (
                            <ExternalLinkIcon size="14px" />
                          )}
                        </a>
                        {row.tags &&
                          row.tags.map((tag) => (
                            <Chip
                              variant="soft"
                              size="sm"
                              color="neutral"
                              sx={{ marginLeft: '0.2rem' }}
                            >
                              {tag}
                            </Chip>
                          ))}
                      </Typography>
                    </td>
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
                      <Typography
                        level="body-sm"
                        marginLeft={2}
                        startDecorator={
                          row.architecture === 'MLX' && <TinyMLXLogo />
                        }
                      >
                        {row.architecture}
                      </Typography>
                    </td>

                    <td>
                      <Typography level="body-sm">
                        {row?.size_of_model_in_mb &&
                          formatBytes(row?.size_of_model_in_mb * 1024 * 1024)}
                      </Typography>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <InfoIcon
                        onClick={() => {
                          setModelDetailsId(row.uniqueID);
                        }}
                      />
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {
                        // Don't display Download Button if gated model and no access token
                        row?.gated && !isHFAccessTokenSet ? (
                          <Button
                            size="sm"
                            endDecorator={<LockKeyholeIcon />}
                            color="warning"
                            onClick={() => {
                              const confirm_result = confirm(
                                'To access gated Hugging Face models you must first:\r\r' +
                                  '1. Create a READ access token in your Hugging Face account.\r\r' +
                                  '2. Enter the token on the Transformer Lab Settings page.\r\r' +
                                  'Click OK to go to Settings.',
                              );
                              if (confirm_result) {
                                navigate('/settings');
                              }
                            }}
                          >
                            Unlock
                          </Button>
                        ) : (
                          // Otherwise display regular Download button
                          <Button
                            size="sm"
                            variant="soft"
                            color="success"
                            disabled={row.downloaded || jobId !== null}
                            onClick={async () => {
                              setJobId(-1);
                              setCurrentlyDownloading(row.name);
                              try {
                                let response = await fetch(
                                  chatAPI.Endpoints.Jobs.Create(),
                                );
                                const newJobId = await response.json();
                                setJobId(newJobId);
                                response = await downloadModelFromGallery(
                                  row?.uniqueID,
                                  newJobId,
                                );
                                if (response?.status == 'error') {
                                  setCurrentlyDownloading(null);
                                  setJobId(null);
                                  return alert(
                                    `Failed to download:\n${response.message}`,
                                  );
                                } else if (response?.status == 'unauthorized') {
                                  setCurrentlyDownloading(null);
                                  setJobId(null);
                                  const confirm_text = `${response.message}\n\nPress OK to open the model agreement.`;
                                  if (confirm(confirm_text)) {
                                    window
                                      .open(
                                        getModelHuggingFaceURL(row),
                                        '_blank',
                                      )
                                      ?.focus();
                                  }
                                }
                                setCurrentlyDownloading(null);
                                setJobId(null);
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
                                          100,
                                        )}
                                        sx={{ width: '100px' }}
                                        variant="solid"
                                      />
                                      &nbsp;&nbsp;
                                      {modelDownloadProgress?.progress !==
                                        -1 && (
                                        <>
                                          {clamp(
                                            Number.parseFloat(
                                              modelDownloadProgress?.progress,
                                            ),
                                            0,
                                            100,
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
                                        modelDownloadProgress?.job_data
                                          ?.downloaded *
                                          1024 *
                                          1024,
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
                        )
                      }
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
        )}
      </Sheet>
      <ImportModelsBar jobId={jobId} setJobId={setJobId} />
    </Sheet>
  );
}
