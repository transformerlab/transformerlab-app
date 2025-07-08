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
  Stack,
  Skeleton,
} from '@mui/joy';
import {
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  InfoIcon,
  LockKeyholeIcon,
  SearchIcon,
  ChevronUpIcon,
  ImageIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from 'renderer/lib/api-client/hooks';
import ModelDetailsModal from './ModelDetailsModal';
import DownloadProgressBox from '../Shared/DownloadProgressBox';
import ImportModelsBar from './ImportModelsBar';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import { formatBytes } from '../../lib/utils';
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

function ModelGroupsSkeleton() {
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
      <Sheet
        variant="plain"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderRadius: 'md',
        }}
      >
        {/* Left side: group list skeleton */}
        <Box
          id="model-group-left-hand-side"
          display="flex"
          flexDirection="column"
          sx={{ flex: 1, pt: 1 }}
        >
          <Box sx={{ flex: 1, p: 1, pt: 0, overflowY: 'auto' }}>
            {[...Array(6)].map((_, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Skeleton
                  variant="rectangular"
                  width="100%"
                  height={56}
                  sx={{ borderRadius: 8 }}
                />
              </Box>
            ))}
          </Box>
        </Box>
        {/* Right side: table skeleton */}
        <Box
          id="model-group-right-hand-side"
          sx={{
            flex: 3,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              overflowX: 'auto',
              width: '100%',
              maxWidth: '100%',
              flex: 1,
              p: 1,
            }}
          >
            {[...Array(6)].map((_, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Skeleton
                  variant="rectangular"
                  width="100%"
                  height="2rem"
                  sx={{ borderRadius: 8 }}
                />
              </Box>
            ))}
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}

export default function ModelGroups() {
  const navigate = useNavigate();
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    archived: false,
    architecture: 'All',
  });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [modelDetailsId, setModelDetailsId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [groupSearchText, setGroupSearchText] = useState('');

  const {
    data: groupData,
    isLoading,
    error,
    mutate,
  } = useAPI('models', ['getModelGroups']);
  const { data: modelDownloadProgress } = useAPI(
    'jobs',
    ['get'],
    { id: jobId && jobId !== -1 ? jobId : null },
    { enabled: jobId && jobId !== -1, refreshInterval: 2000 },
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

  useEffect(() => {
    if (!selectedGroup && groupData && groupData.length > 0) {
      const firstGroup = [...groupData].sort((a, b) =>
        a.name.localeCompare(b.name),
      )[0];
      if (firstGroup) {
        setSelectedGroup(firstGroup);
      } else {
        setSelectedGroup(groupData[0]); // fallback
      }
    }
  }, [groupData, selectedGroup]);

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

  if (isLoading) return <ModelGroupsSkeleton />;
  if (error) return <Typography>Error loading model groups.</Typography>;
  if (!groupData || !selectedGroup) return null;

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
        {/* Responsive style for license-col */}
        <style>{`
          .license-col {
            display: none;
          }
          @media (min-width: 1200px) {
            .license-col {
              display: table-cell !important;
            }
          }
        `}</style>
        <Box
          id="model-group-left-hand-side"
          display="flex"
          flexDirection="column"
          sx={{ flex: 1 }}
        >
          <Box
            sx={{
              borderRadius: 'sm',
              p: 1,
            }}
          >
            <Input
              placeholder="Search groups"
              value={groupSearchText}
              onChange={(e) => setGroupSearchText(e.target.value)}
              startDecorator={<SearchIcon />}
              size="sm"
            />
          </Box>

          <Box
            sx={{
              flex: 1,
              p: 1,
              pt: 0,
              overflowY: 'auto',
            }}
          >
            {[...groupData]
              .filter((group) =>
                group.name
                  .toLowerCase()
                  .includes(groupSearchText.toLowerCase()),
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => {
                const isSelected = selectedGroup?.name === group.name;
                let isImageModel = false;
                // isImageModel is true if "Image Generation" is in the tags array:
                if (group.tags?.includes('Image Generation')) {
                  isImageModel = true;
                }
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
                    <Stack direction="row" spacing={2}>
                      <Box>
                        <Typography
                          level="body-sm"
                          fontWeight="bold"
                          sx={{
                            textAlign: 'left',
                            width: '100%',
                            color: isSelected ? 'common.white' : undefined,
                          }}
                        >
                          {group.name.charAt(0).toUpperCase() +
                            group.name.slice(1)}
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
                          <Box
                            sx={{
                              maxHeight: 60,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {group.description}
                          </Box>
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          alignSelf: 'center',
                        }}
                      >
                        {group?.image && (
                          <img
                            src={group.image}
                            alt={group.name}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '4px',
                              objectFit: 'cover',
                            }}
                          />
                        )}
                      </Box>
                    </Stack>
                  </Button>
                );
              })}
          </Box>
        </Box>
        <Box
          id="model-group-right-hand-side"
          sx={{
            flex: 3,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <>
            <Sheet
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 20,
                m: 1,
                p: 2,
              }}
              color="primary"
              variant="soft"
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  mb: 1,
                }}
              >
                <Typography level="h4">
                  {selectedGroup.name.charAt(0).toUpperCase() +
                    selectedGroup.name.slice(1)}
                </Typography>
                {selectedGroup.tags?.map((tag) => (
                  <Chip
                    key={tag}
                    size="sm"
                    variant="outlined"
                    sx={{
                      fontSize: '0.7rem',
                      variant: 'soft',
                      color: 'info',
                    }}
                  >
                    {tag}
                  </Chip>
                ))}
              </Box>
              {/* <Typography level="body-md" sx={{ mb: 2 }}>
                {selectedGroup.description}
              </Typography> */}
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
            </Sheet>

            <Box
              sx={{
                overflowX: 'auto',
                width: '100%',
                maxWidth: '100%',
                flex: 1,
                p: 1,
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
                    <th>
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
                      >
                        Name
                      </Link>
                    </th>
                    <th className="license-col">
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
                      >
                        License
                      </Link>
                    </th>
                    <th>
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
                      >
                        Engine
                      </Link>
                    </th>
                    <th style={{ width: 80 }}>
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
                      >
                        Size
                      </Link>
                    </th>
                    <th>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {stableSort(
                    filterByFilters(selectedGroup.models, searchText, filters),
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
                          {/* {row.tags?.map((tag) => (
                            <Chip
                              key={tag}
                              size="sm"
                              variant="soft"
                              color="neutral"
                            >
                              {tag}
                            </Chip>
                          ))} */}
                        </Typography>
                      </td>
                      <td className="license-col">
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
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 150, // adjust as needed to fit your column
                            display: 'block',
                          }}
                        >
                          {row.architecture}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {formatBytes(row?.size_of_model_in_mb * 1024 * 1024)}
                        </Typography>
                      </td>

                      <td style={{ textAlign: 'right' }}>
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
                            sx={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
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
                              row.downloaded ? <CheckIcon size="18px" /> : null
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
