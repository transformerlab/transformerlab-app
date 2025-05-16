/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/anchor-is-valid */
import {
  Box,
  Button,
  Chip,
  FormControl,
  FormLabel,
  Input,
  LinearProgress,
  Option,
  Select,
  Sheet,
  Table,
  Typography,
  Link,
} from '@mui/joy';
import {
  CheckIcon,
  DownloadIcon,
  ArrowDownIcon,
  ExternalLinkIcon,
  InfoIcon,
  LockKeyholeIcon,
  SearchIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAPI from 'renderer/lib/api-client/hooks';
import ModelDetailsModal from './ModelDetailsModal';
import DownloadProgressBox from '../Shared/DownloadProgressBox';
import ImportModelsBar from './ImportModelsBar';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import { clamp, formatBytes } from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { downloadModelFromGallery } from '../../lib/transformerlab-api-sdk';

function getModelHuggingFaceURL(model) {
  const repo_id = model.huggingface_repo ? model.huggingface_repo : model.id;
  return 'https://huggingface.co/' + repo_id;
}

function descendingComparator(a, b, orderBy) {
  if (orderBy === 'size') {
    return b.size_of_model_in_mb - a.size_of_model_in_mb;
  }
  if (b[orderBy] < a[orderBy]) return -1;
  if (b[orderBy] > a[orderBy]) return 1;
  return 0;
}

function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort(array, comparator) {
  const stabilized = array.map((el, idx) => [el, idx]);
  stabilized.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    return order !== 0 ? order : a[1] - b[1];
  });
  return stabilized.map((el) => el[0]);
}

function filterByFilters(data, searchText = '', filters = {}) {
  return data.filter((row) => {
    if (!row.name?.toLowerCase().includes(searchText.toLowerCase()))
      return false;
    if (
      filters.license &&
      filters.license !== 'All' &&
      row.license?.toLowerCase() !== filters.license.toLowerCase()
    )
      return false;
    if (
      filters.architecture &&
      filters.architecture !== 'All' &&
      row.architecture?.toLowerCase() !== filters.architecture.toLowerCase()
    )
      return false;
    if (filters.archived !== 'All') {
      const isArchived = !!row.archived;
      if (filters.archived === false && isArchived) return false;
    }
    return true;
  });
}

export default function ModelGroups() {
  const navigate = useNavigate();
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    archived: false,
    license: 'All',
    architecture: 'All',
  });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [modelDetailsId, setModelDetailsId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);
  const [canceling, setCanceling] = useState(false);

  const {
    data: groupData,
    isLoading,
    error,
    mutate,
  } = useAPI('models', ['getModelGroups']);
  const { data: modelDownloadProgress } = useAPI(
    'jobs',
    ['get'],
    jobId && jobId !== '-1' ? { id: jobId } : {},
    { enabled: jobId && jobId !== '-1', refreshInterval: 2000 },
  );
  const { data: canLogInToHuggingFace } = useAPI('models', [
    'loginToHuggingFace',
  ]);
  const isHFAccessTokenSet = canLogInToHuggingFace?.message === 'OK';

  useEffect(() => {
    fetch(chatAPI.Endpoints.Jobs.GetJobsOfType('DOWNLOAD_MODEL', 'RUNNING'))
      .then((res) => res.json())
      .then((jobs) => {
        if (jobs.length) {
          setJobId(jobs[0]?.id);
          setCurrentlyDownloading(jobs[0]?.job_data?.model || 'Unknown');
        }
      });
  }, [currentlyDownloading]);

  useEffect(() => {
    if (modelDownloadProgress?.status === 'COMPLETE') {
      setCurrentlyDownloading(null);
      setJobId(null);
      mutate();
    }
  }, [modelDownloadProgress]);

  useEffect(() => {
    if (selectedGroup) {
      setFilters({ archived: false, license: 'All', architecture: 'All' });
    }
  }, [selectedGroup]);

  const getLicenseOptions = (models) => {
    const lowercaseSet = new Set();
    models?.forEach((m) => {
      if (m.license) lowercaseSet.add(m.license.toLowerCase());
    });
    return Array.from(lowercaseSet).sort();
  };

  const getArchitectureOptions = (models) => {
    const lowercaseSet = new Set();
    models?.forEach((m) => {
      if (m.architecture) lowercaseSet.add(m.architecture.toLowerCase());
    });
    return Array.from(lowercaseSet).sort();
  };

  const licenseOptions = selectedGroup
    ? getLicenseOptions(selectedGroup.models)
    : [];
  const archOptions = selectedGroup
    ? getArchitectureOptions(selectedGroup.models)
    : [];

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography>Error loading model groups.</Typography>;

  const handleSortClick = (column) => {
    const isAsc = orderBy === column && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(column);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'auto',
        minHeight: 0,
      }}
    >
      <Box sx={{ position: 'relative', marginBottom: 2 }}>
        <DownloadProgressBox jobId={jobId} assetName={currentlyDownloading} />
        {jobId && (
          <Button
            variant="outlined"
            size="sm"
            color="danger"
            disabled={canceling}
            onClick={async () => {
              setCanceling(true);
              const response = await fetch(chatAPI.Endpoints.Jobs.Stop(jobId));
              if (response.ok) {
                setJobId(null);
                setCurrentlyDownloading(null);
              } else {
                alert('Failed to cancel download');
              }
              setCanceling(false);
            }}
            sx={{ position: 'absolute', top: '1rem', right: '1rem' }}
          >
            Cancel Download
          </Button>
        )}
      </Box>

      <ModelDetailsModal
        modelId={modelDetailsId}
        setModelId={setModelDetailsId}
      />

      <Sheet
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderRadius: 'md',
        }}
      >
        <Box
          sx={{
            width: '25%',
            borderRight: '1px solid #ccc',
            p: 1,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            overflowY: 'auto',
            maxHeight: '100%',
          }}
        >
          {[...groupData]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => {
              const isSelected = selectedGroup?.name === group.name;
              return (
                <Button
                  key={group.name}
                  fullWidth
                  variant={isSelected ? 'solid' : 'soft'}
                  onClick={() => setSelectedGroup(group)}
                  sx={{
                    justifyContent: 'flex-start',
                    mb: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{
                      textAlign: 'left',
                      width: '100%',
                      color: isSelected ? 'common.white' : undefined,
                    }}
                  >
                    {group.name.charAt(0).toUpperCase() + group.name.slice(1)}
                  </Typography>
                  <Typography
                    level="body-xs"
                    sx={{
                      whiteSpace: 'normal',
                      textAlign: 'left',
                      width: '100%',
                      color: isSelected ? 'common.white' : undefined,
                    }}
                  >
                    {group.description}
                  </Typography>
                </Button>
              );
            })}
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {selectedGroup ? (
            <>
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 20,
                  backgroundColor: 'background.body',
                  p: 2,
                  borderBottom: '1px solid #ccc',
                }}
              >
                <Typography level="h4" sx={{ mb: 1 }}>
                  {selectedGroup.name.charAt(0).toUpperCase() +
                    selectedGroup.name.slice(1)}
                </Typography>
                <Typography level="body-md" sx={{ mb: 2 }}>
                  {selectedGroup.description}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  <FormControl sx={{ flex: 1 }} size="sm">
                    <FormLabel>&nbsp;</FormLabel>
                    <Input
                      placeholder="Search"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      startDecorator={<SearchIcon />}
                    />
                  </FormControl>
                  <FormControl size="sm">
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={filters?.archived}
                      onChange={(e, newValue) =>
                        setFilters({ ...filters, archived: newValue })
                      }
                    >
                      <Option value={false}>Hide Archived</Option>
                      <Option value="All">Show Archived</Option>
                    </Select>
                  </FormControl>
                  <FormControl size="sm">
                    <FormLabel>License</FormLabel>
                    <Select
                      value={filters?.license}
                      onChange={(e, newValue) =>
                        setFilters({ ...filters, license: newValue })
                      }
                    >
                      <Option value="All">All</Option>
                      {licenseOptions.map((type) => (
                        <Option key={type} value={type}>
                          {type}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="sm">
                    <FormLabel>Architecture</FormLabel>
                    <Select
                      value={filters?.architecture}
                      onChange={(e, newValue) =>
                        setFilters({ ...filters, architecture: newValue })
                      }
                    >
                      <Option value="All">All</Option>
                      {archOptions.map((type) => (
                        <Option key={type} value={type}>
                          {type}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <Box
                sx={{
                  overflowX: 'auto',
                  width: '100%',
                  maxWidth: '100%',
                  flex: 1,
                }}
              >
                <Table
                  hoverRow
                  stickyHeader
                  sx={{
                    width: '100%',
                    tableLayout: 'fixed',
                    '& th, & td': {
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      padding: '8px',
                    },
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: 170, padding: 12 }}>
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
                            orderBy === 'name' && (
                              <ChevronUpIcon
                                color="var(--joy-palette-primary-plainColor)"
                                style={{
                                  transition: '0.2s',
                                  transform:
                                    order === 'asc'
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                }}
                              />
                            )
                          }
                          sx={{ marginLeft: 2 }}
                        >
                          Name
                        </Link>
                      </th>
                      <th style={{ width: 120, padding: 12 }}>
                        <Link
                          underline="none"
                          color="primary"
                          component="button"
                          onClick={() => {
                            setOrder(order === 'asc' ? 'desc' : 'asc');
                            setOrderBy('license');
                          }}
                          fontWeight="lg"
                          endDecorator={
                            orderBy === 'license' && (
                              <ChevronUpIcon
                                color="var(--joy-palette-primary-plainColor)"
                                style={{
                                  transition: '0.2s',
                                  transform:
                                    order === 'asc'
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                }}
                              />
                            )
                          }
                          sx={{ marginLeft: 2 }}
                        >
                          License
                        </Link>
                      </th>
                      <th style={{ width: 170, padding: 12 }}>
                        <Link
                          underline="none"
                          color="primary"
                          component="button"
                          onClick={() => {
                            setOrder(order === 'asc' ? 'desc' : 'asc');
                            setOrderBy('architecture');
                          }}
                          fontWeight="lg"
                          endDecorator={
                            orderBy === 'architecture' && (
                              <ChevronUpIcon
                                color="var(--joy-palette-primary-plainColor)"
                                style={{
                                  transition: '0.2s',
                                  transform:
                                    order === 'asc'
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                }}
                              />
                            )
                          }
                          sx={{ marginLeft: 2 }}
                        >
                          Engine
                        </Link>
                      </th>
                      <th style={{ width: 170, padding: 12 }}>
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
                            orderBy === 'size_of_model_in_mb' && (
                              <ChevronUpIcon
                                color="var(--joy-palette-primary-plainColor)"
                                style={{
                                  transition: '0.2s',
                                  transform:
                                    order === 'asc'
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                }}
                              />
                            )
                          }
                          sx={{ marginLeft: 2 }}
                        >
                          Size
                        </Link>
                      </th>
                      <th style={{ width: 50, padding: 8 }}></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stableSort(
                      filterByFilters(
                        selectedGroup.models,
                        searchText,
                        filters,
                      ),
                      getComparator(order, orderBy),
                    ).map((row) => (
                      <tr key={row.uniqueID}>
                        <td>
                          <Typography level="body-sm">
                            {row.new && (
                              <Chip size="sm" color="warning">
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
                                  size="sm"
                                  color="warning"
                                  endDecorator={<LockKeyholeIcon size="13px" />}
                                >
                                  Gated
                                </Chip>
                              ) : (
                                <ExternalLinkIcon size="14px" />
                              )}
                            </a>
                            {row.tags?.map((tag) => (
                              <Chip
                                key={tag}
                                size="sm"
                                variant="soft"
                                color="neutral"
                              >
                                {tag}
                              </Chip>
                            ))}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="soft" color="neutral">
                            {row.license}
                          </Chip>
                        </td>
                        <td
                          style={{
                            width: 170,
                            maxWidth: 170,
                            wordBreak: 'break-all',
                            whiteSpace: 'normal',
                          }}
                        >
                          <Typography
                            level="body-sm"
                            startDecorator={
                              row.architecture === 'MLX' && <TinyMLXLogo />
                            }
                          >
                            {row.architecture}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {formatBytes(
                              row?.size_of_model_in_mb * 1024 * 1024,
                            )}
                          </Typography>
                        </td>
                        <td>
                          <InfoIcon
                            onClick={() => setModelDetailsId(row.uniqueID)}
                          />
                        </td>
                        <td>
                          {row.gated && !isHFAccessTokenSet ? (
                            <Button
                              size="sm"
                              endDecorator={<LockKeyholeIcon />}
                              color="warning"
                              onClick={() => {
                                if (
                                  confirm(
                                    'To access gated Hugging Face models you must first create a token. Go to settings',
                                  )
                                ) {
                                  navigate('/settings');
                                }
                              }}
                            >
                              Unlock
                            </Button>
                          ) : (
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
                                  if (response?.status !== 'success') {
                                    alert(
                                      `Failed to download: ${response.message}`,
                                    );
                                    setCurrentlyDownloading(null);
                                    setJobId(null);
                                  } else {
                                    const updatedData = await mutate();
                                    const updatedGroup = updatedData?.find(
                                      (g) => g.name === selectedGroup?.name,
                                    );
                                    if (updatedGroup) {
                                      setSelectedGroup(updatedGroup);
                                    }
                                  }
                                } catch (e) {
                                  alert('Failed to download');
                                  setCurrentlyDownloading(null);
                                  setJobId(null);
                                }
                              }}
                              startDecorator={<DownloadIcon size="18px" />}
                              endDecorator={
                                row.downloaded ? (
                                  <CheckIcon size="18px" />
                                ) : null
                              }
                            >
                              Download{row.downloaded ? 'ed' : ''}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Box>
            </>
          ) : (
            <Typography p={2}>Select a group to see its models</Typography>
          )}
        </Box>
      </Sheet>

      <Box
        sx={{
          borderTop: '1px solid #ccc',
          padding: 1,
          background: 'background.body',
        }}
      >
        <ImportModelsBar jobId={jobId} setJobId={setJobId} />
      </Box>
    </Sheet>
  );
}
