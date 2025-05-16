/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/anchor-is-valid */
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useNavigate } from 'react-router-dom';
import { useAPI } from 'renderer/lib/api-client/hooks';
import ModelDetailsModal from './ModelDetailsModal';
import DownloadProgressBox from '../Shared/DownloadProgressBox';
import ImportModelsBar from './ImportModelsBar';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import {
  clamp,
  filterByFilters,
  formatBytes,
  licenseTypes,
  modelTypes,
} from '../../lib/utils';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { downloadModelFromGallery } from '../../lib/transformerlab-api-sdk';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function getModelHuggingFaceURL(model) {
  const repo_id = model.huggingface_repo ? model.huggingface_repo : model.id;
  return 'https://huggingface.co/' + repo_id;
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) return -1;
  if (b[orderBy] > a[orderBy]) return 1;
  return 0;
}

function getComparator<Key extends keyof any>(
  order: 'asc' | 'desc',
  orderBy: Key,
) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort<T>(
  array: readonly T[],
  comparator: (a: T, b: T) => number,
) {
  const stabilized = array.map((el, idx) => [el, idx] as [T, number]);
  stabilized.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    return order !== 0 ? order : a[1] - b[1];
  });
  return stabilized.map((el) => el[0]);
}

export default function ModelGroups() {
  const navigate = useNavigate();
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [orderBy, setOrderBy] = useState('name');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({ archived: false });
  const [expandedGroup, setExpandedGroup] = useState<string | false>(false);
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
    {
      enabled: jobId && jobId !== '-1',
      refreshInterval: 2000,
    },
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
      mutate(); // Refresh group gallery data
    }
  }, [modelDownloadProgress]);

  const renderFilters = () => (
    <>
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
          {licenseTypes.map((type) => (
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
          {modelTypes.map((type) => (
            <Option key={type} value={type}>
              {type}
            </Option>
          ))}
        </Select>
      </FormControl>
    </>
  );

  if (isLoading) return <LinearProgress />;
  if (error) return <Typography>Error loading model groups.</Typography>;

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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
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
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          borderRadius: 'md',
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            padding: 1,
          }}
        >
          {[...groupData]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => {
              const models = stableSort(
                filterByFilters(group.models, searchText, filters),
                getComparator(order, orderBy),
              );
              if (models.length === 0) return null;
              return (
                <div id={`group-${group.name}`}>
                  <Accordion
                    key={group.name}
                    expanded={expandedGroup === group.name}
                    onChange={(_, isExpanded) => {
                      setExpandedGroup(isExpanded ? group.name : false);

                      if (isExpanded) {
                        // Delay scroll slightly to allow prior group to collapse
                        setTimeout(() => {
                          const el = document.getElementById(
                            `group-${group.name}`,
                          );
                          if (el) {
                            el.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }
                        }, 100); // 100ms gives time for layout to adjust
                      }
                    }}
                  >
                    <AccordionSummary>
                      {group.name.charAt(0).toUpperCase() + group.name.slice(1)}
                    </AccordionSummary>
                    <AccordionDetails>
                      <Table hoverRow stickyHeader>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>License</th>
                            <th>Engine</th>
                            <th>Size</th>
                            <th></th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {models.map((row) => (
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
                                        endDecorator={
                                          <LockKeyholeIcon size="13px" />
                                        }
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
                              <td>
                                <Typography
                                  level="body-sm"
                                  startDecorator={
                                    row.architecture === 'MLX' && (
                                      <TinyMLXLogo />
                                    )
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
                                  onClick={() =>
                                    setModelDetailsId(row.uniqueID)
                                  }
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
                                        response =
                                          await downloadModelFromGallery(
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
                                          mutate();
                                        }
                                      } catch (e) {
                                        alert('Failed to download');
                                        setCurrentlyDownloading(null);
                                        setJobId(null);
                                      }
                                    }}
                                    startDecorator={
                                      <DownloadIcon size="18px" />
                                    }
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
                    </AccordionDetails>
                  </Accordion>
                </div>
              );
            })}
        </Box>
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
    </Sheet>
  );
}
