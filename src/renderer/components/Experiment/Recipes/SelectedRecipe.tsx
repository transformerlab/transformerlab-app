import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Typography,
  Input,
  Box,
  Sheet,
  FormControl,
  FormLabel,
  FormHelperText,
  LinearProgress,
  Chip,
  CircularProgress,
} from '@mui/joy';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleXIcon,
  RocketIcon,
  DownloadIcon,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';
import { useAPI, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';

export function isRecipeCompatibleWithDevice(recipe: any, device: any) {
  if (!recipe?.requiredMachineArchitecture) return true;
  if (!device) return false;

  if (device === 'apple_silicon') {
    return recipe.requiredMachineArchitecture.includes('mlx');
  }
  if (device === 'nvidia') {
    return recipe.requiredMachineArchitecture.includes('cuda');
  }
  if (device === 'amd') {
    return recipe.requiredMachineArchitecture.includes('amd');
  }
  if (device === 'cpu') {
    return recipe.requiredMachineArchitecture.includes('cpu');
  }

  return false;
}

// Component that reuses ExperimentNotes styling for recipe notes
const RecipeNotesDisplay = ({ notes }: { notes: string }) => {
  if (!notes) return null;

  return (
    <>
      <Typography level="title-lg" mb={1}>
        Experiment Notes:
      </Typography>
      <Sheet
        color="neutral"
        variant="soft"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '600px',
          pl: 3,
          height: '100%',

          overflow: 'hidden',
          borderRadius: 1,
        }}
      >
        <Box
          display="flex"
          flexDirection="column"
          sx={{ width: '100%', height: '100%', overflowY: 'auto' }}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{notes}</Markdown>
        </Box>
      </Sheet>
    </>
  );
};

// Helper components
const InstalledStateChip = ({ state }: { state: any }) => {
  let color: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral';
  let label = 'Unknown';
  if (state === 'loading') {
    color = 'warning';
    label = 'Checking...';
  } else if (state === true) {
    color = 'success';
    label = 'Installed';
  } else if (state === false) {
    color = 'danger';
    label = 'Not Installed';
  }
  return (
    <Chip
      variant="soft"
      color={color}
      size="sm"
      sx={{
        ml: 'auto',
        fontSize: '0.75rem',
        textTransform: 'capitalize',
      }}
    >
      {label}
    </Chip>
  );
};

const ModelProgressBar = ({ jobData }: { jobData: any }) => {
  if (!jobData) return null;

  const progress = jobData.progress || 0;
  const status = jobData.status || 'RUNNING';

  if (status === 'COMPLETE') {
    return (
      <Chip
        variant="soft"
        color="success"
        size="sm"
        sx={{
          ml: 'auto',
          fontSize: '0.75rem',
        }}
      >
        Installed
      </Chip>
    );
  }

  if (status === 'FAILED') {
    return (
      <Chip
        variant="soft"
        color="danger"
        size="sm"
        sx={{
          ml: 'auto',
          fontSize: '0.75rem',
        }}
      >
        Failed
      </Chip>
    );
  }

  return (
    <Box sx={{ ml: 'auto', minWidth: '120px' }}>
      <LinearProgress determinate value={progress} sx={{ mb: 0.5 }} size="sm" />
      <Typography level="body-xs" sx={{ textAlign: 'center' }}>
        {Math.round(progress)}%
      </Typography>
    </Box>
  );
};

// Custom RecipeDependencies component that shows progress for model downloads
const RecipeDependenciesWithProgress = ({
  recipeId,
  dependencies,
  dependenciesLoading,
  dependenciesMutate,
  installationJobs,
  setInstallationJobs,
}: {
  recipeId: any;
  dependencies: any;
  dependenciesLoading: any;
  dependenciesMutate: any;
  installationJobs: any;
  setInstallationJobs: any;
}) => {
  const [isInstallingDependencies, setIsInstallingDependencies] =
    useState(false);

  // Get job progress for model downloads - memoized to prevent re-renders
  const modelDownloadJobs = useMemo(
    () =>
      installationJobs?.filter((job: any) => job.type === 'DOWNLOAD_MODEL') ||
      [],
    [installationJobs],
  );

  // Create a single SWR key that includes all job IDs
  const allJobIds = modelDownloadJobs
    .map((job: any) => job.job_id)
    .filter(Boolean);
  const jobsKey = allJobIds.length > 0 ? `jobs-${allJobIds.join(',')}` : null;

  // Fetch all job data in a single request
  const { data: allJobsData } = useSWR(
    jobsKey,
    async () => {
      const promises = allJobIds.map((jobId: any) =>
        fetch(chatAPI.Endpoints.Jobs.Get(jobId)).then((res) => res.json()),
      );
      const results = await Promise.all(promises);

      // Create a map of job data by job ID
      const jobDataMap: any = {};
      results.forEach((jobData, index) => {
        const jobId = allJobIds[index];
        const job = modelDownloadJobs.find((j: any) => j.job_id === jobId);
        if (job) {
          jobDataMap[job.name] = jobData;
        }
      });

      return jobDataMap;
    },
    { refreshInterval: 1000 },
  );

  // Use the fetched data or fallback to empty object
  const modelJobsData: any = useMemo(() => allJobsData || {}, [allJobsData]);

  // Monitor job completion and refresh dependencies
  useEffect(() => {
    const completedJobs = Object.values(modelJobsData).filter(
      (job: any) => job?.status === 'completed' || job?.status === 'COMPLETE',
    );

    if (completedJobs.length > 0) {
      // Refresh dependencies when jobs complete
      dependenciesMutate();
    }
  }, [modelJobsData, dependenciesMutate]);

  // Poll dependencies when installing non-model dependencies
  useEffect(() => {
    let pollInterval: number;

    if (isInstallingDependencies) {
      // Poll every 2 seconds to check if dependencies are installed
      pollInterval = window.setInterval(() => {
        dependenciesMutate();
      }, 2000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isInstallingDependencies, dependenciesMutate]);

  // Stop polling when all dependencies are installed
  useEffect(() => {
    if (isInstallingDependencies && dependencies) {
      const stillMissingDependencies = dependencies.some((dep: any) => {
        if (dep.installed === true) {
          return false; // Already installed
        }

        // For models, check if there's any download job (active or completed)
        if (dep.type === 'model') {
          const hasAnyJob = modelDownloadJobs.some(
            (job: any) => job.name === dep.name,
          );
          if (hasAnyJob) {
            // Check if the job failed
            const jobData =
              modelJobsData[
                modelDownloadJobs.find((job: any) => job.name === dep.name)
                  ?.name
              ];
            if (jobData?.status === 'failed' || jobData?.status === 'FAILED') {
              return true; // Count as missing if job failed
            }
            return false; // Don't count as missing if there's an active or completed job
          }
        }

        return true; // Count as missing
      });

      // If no dependencies are missing anymore, stop the installation state
      if (!stillMissingDependencies) {
        setIsInstallingDependencies(false);
      }
    }
  }, [
    dependencies,
    modelDownloadJobs,
    modelJobsData,
    isInstallingDependencies,
  ]);

  if (dependenciesLoading) return <CircularProgress sx={{ mt: 1, mb: 1 }} />;

  if (!dependencies) {
    return null;
  }

  // Group dependencies by type
  const groupedDependencies = (dependencies || []).reduce(
    (acc: any, dep: any) => {
      acc[dep.type] = acc[dep.type] || [];
      acc[dep.type].push(dep);
      return acc;
    },
    {},
  );

  const countMissingDependencies = dependencies?.filter((dep: any) => {
    if (dep.installed === true) {
      return false; // Already installed
    }

    // For models, check if there's any download job (active or completed)
    if (dep.type === 'model') {
      const hasAnyJob = modelDownloadJobs.some(
        (job: any) => job.name === dep.name,
      );
      if (hasAnyJob) {
        // Check if the job failed
        const jobData =
          modelJobsData[
            modelDownloadJobs.find((job: any) => job.name === dep.name)?.name
          ];
        if (jobData?.status === 'failed' || jobData?.status === 'FAILED') {
          return true; // Count as missing if job failed
        }
        return false; // Don't count as missing if there's an active or completed job
      }
    }

    return true; // Count as missing
  }).length;

  return (
    dependencies &&
    dependencies.length > 0 && (
      <>
        <Typography
          level="title-lg"
          mb={0}
          endDecorator={
            <>
              {countMissingDependencies === 0 && (
                <CircleCheckIcon
                  color="var(--joy-palette-success-400)"
                  size={20}
                />
              )}
              {countMissingDependencies > 0 && (
                <CircleXIcon color="var(--joy-palette-danger-400)" size={20} />
              )}
            </>
          }
        >
          Dependencies:
        </Typography>
        <Sheet
          variant="soft"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            p: 2,
            mr: 1,
            minWidth: '340px',
            minHeight: '60px',
            maxHeight: '300px',
            position: 'relative',
          }}
        >
          {Object.entries(groupedDependencies).map(([type, deps]) => (
            <Box key={type} sx={{ mb: 1 }}>
              <Typography level="title-md" sx={{ textTransform: 'capitalize' }}>
                {type}s
              </Typography>
              <Box sx={{ pl: 2 }}>
                {(deps as any[]).map((dep: any) => {
                  // Check if this is a model with an active download job
                  const modelJob =
                    type === 'model'
                      ? modelDownloadJobs.find(
                          (job: any) => job.name === dep.name,
                        )
                      : null;

                  // Get job data from the map
                  const jobData = modelJob
                    ? modelJobsData[modelJob.name]
                    : null;

                  let statusComponent;

                  // Show progress bar only for models with active jobs and job data
                  if (modelJob && jobData) {
                    statusComponent = <ModelProgressBar jobData={jobData} />;
                  } else if (modelJob) {
                    // Show loading spinner for models with active jobs but no data yet
                    statusComponent = (
                      <Box sx={{ ml: 'auto' }}>
                        <CircularProgress size="sm" />
                      </Box>
                    );
                  } else {
                    // Use the original dependency status for all other cases
                    statusComponent = (
                      <InstalledStateChip state={dep?.installed} />
                    );
                  }

                  return (
                    <Box
                      component="li"
                      key={dep.name}
                      sx={{ display: 'flex', alignItems: 'center', mb: 1 }}
                    >
                      <Typography level="body-sm" mr={1}>
                        {dep.name}
                      </Typography>
                      {statusComponent}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Sheet>
        {countMissingDependencies > 0 && !isInstallingDependencies && (
          <Button
            color="warning"
            size="sm"
            variant="plain"
            startDecorator={<DownloadIcon />}
            onClick={async () => {
              setIsInstallingDependencies(true);

              try {
                const installTask = await fetch(
                  getAPIFullPath('recipes', ['installDependencies'], {
                    id: recipeId,
                  }),
                );
                const installTaskJson = await installTask.json();

                // Handle installation response
                if (installTaskJson?.jobs) {
                  // Update installation jobs to track progress
                  setInstallationJobs(installTaskJson.jobs);
                }

                // Refresh dependencies after starting installation
                // This will update the status for plugins, datasets, etc.
                dependenciesMutate();

                // Also refresh after a short delay to catch any quick installations
                setTimeout(() => {
                  dependenciesMutate();
                }, 2000);
              } catch (error) {
                // Handle error - dependency installation failed
                setIsInstallingDependencies(false);
              }
            }}
          >
            Install ({countMissingDependencies}) Missing Dependenc
            {countMissingDependencies === 1 ? 'y' : 'ies'}
          </Button>
        )}
        {isInstallingDependencies && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size="sm" />
            <Typography level="body-sm" color="primary">
              Installing dependencies...
            </Typography>
          </Box>
        )}
      </>
    )
  );
};

export default function SelectedRecipe({
  recipe,
  setSelectedRecipeId,
  installRecipe,
}: {
  recipe: any;
  setSelectedRecipeId: any;
  installRecipe: any;
}) {
  const [experimentNameFormValue, setExperimentNameFormValue] = useState('');
  const [experimentNameTouched, setExperimentNameTouched] = useState(false);
  const [experimentName, setExperimentName] = useState('');
  const [installationJobs, setInstallationJobs] = useState([]);

  const [experimentNameError, setExperimentNameError] = useState('');

  const { data, isLoading, mutate } = useAPI('recipes', ['checkDependencies'], {
    id: recipe?.id,
  });

  const { data: serverInfo } = useAPI('server', ['info']);
  const machineType = serverInfo?.device_type;

  // Check if all dependencies are installed - simplified check
  let missingAnyDependencies = false;
  if (data?.dependencies) {
    missingAnyDependencies = data.dependencies.some(
      (dep: any) => !dep.installed,
    );
  }

  const isHardwareCompatible = isRecipeCompatibleWithDevice(
    recipe,
    machineType,
  );

  async function handleSetExperimentName(name: string) {
    if (!name) {
      setExperimentNameTouched(true);
      return;
    }

    const existingExperiments = await fetch(
      getAPIFullPath('experiment', ['getAll'], {}),
    ).then((res) => res.json());
    if (existingExperiments.some((exp: any) => exp.name === name)) {
      setExperimentNameTouched(true);
      setExperimentNameError(`Experiment name "${name}" already exists.`);
      return; // Don't allow duplicate names
    }

    // Clear any previous errors and proceed to step 2
    setExperimentNameError('');
    setExperimentName(name);
    setExperimentNameFormValue(name);
    setExperimentNameTouched(false);
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    try {
      // Call the original installRecipe function but also track jobs
      const result = await installRecipe(recipe?.id, experimentNameFormValue);

      // If the API returns jobs, track them
      if (result && result.jobs) {
        setInstallationJobs(result.jobs);
      }
    } catch (error) {
      // Handle error
    }
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        px: 2,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      <Box>
        <Typography level="h2" mb={2}>
          {experimentName === '' ? (
            <>
              <Button
                size="sm"
                variant="plain"
                onClick={() => {
                  setSelectedRecipeId(null);
                }}
              >
                <ArrowLeftIcon />
              </Button>
              Step 1: Set Experiment Name
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="plain"
                onClick={() => {
                  setExperimentName('');
                }}
              >
                <ArrowLeftIcon />
              </Button>
              Step 2: Install Dependencies
            </>
          )}
        </Typography>
      </Box>
      <Box
        id="recipe-details"
        sx={{
          width: '100%',
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', md: 'row' },
          overflowY: 'auto',
          overflowX: 'hidden',
          pt: 2,
          justifyContent: 'space-between',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        {experimentName === '' ? (
          <Box id="recipe-left" sx={{ overflowY: 'auto', padding: 1 }}>
            <FormControl
              required
              error={!experimentNameFormValue && experimentNameTouched}
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSetExperimentName(experimentNameFormValue);
              }}
            >
              <FormLabel sx={{ fontWeight: 'regular' }}>
                Experiment Name:
              </FormLabel>
              <Input
                size="lg"
                sx={{ width: '300px' }}
                value={experimentNameFormValue}
                onChange={(e) => {
                  setExperimentNameFormValue(e.target.value);
                  if (!experimentNameTouched) setExperimentNameTouched(true);
                  // Clear error when user starts typing a new name
                  if (experimentNameError) setExperimentNameError('');
                }}
                onBlur={() => setExperimentNameTouched(true)}
                required
                name="experimentName"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSetExperimentName(experimentNameFormValue);
                  }
                }}
              />
              {!experimentNameFormValue && experimentNameTouched && (
                <FormHelperText>This field is required.</FormHelperText>
              )}
              {experimentNameError && (
                <FormHelperText>{experimentNameError}</FormHelperText>
              )}
              <Button
                sx={{ mt: 2 }}
                type="submit"
                onClick={() => handleSetExperimentName(experimentNameFormValue)}
              >
                Save
              </Button>
            </FormControl>
          </Box>
        ) : (
          <>
            {/* Left side: Video or Experiment Notes */}
            <Box
              id="recipe-left"
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: '300px',
                maxHeight: '400px',
                overflow: 'hidden',
              }}
            >
              {(() => {
                if (recipe?.video) {
                  return (
                    <Box>
                      <Typography level="title-lg" mb={1}>
                        Tutorial Video:
                      </Typography>
                      <Box
                        sx={{
                          width: '100%',
                          height: '250px',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <iframe
                          src={recipe.video}
                          width="100%"
                          height="100%"
                          style={{ border: 'none' }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Recipe Tutorial Video"
                        />
                      </Box>
                    </Box>
                  );
                }
                if (recipe?.notes) {
                  return <RecipeNotesDisplay notes={recipe.notes} />;
                }
                return (
                  <Box>
                    <Typography level="title-lg" mb={1}>
                      About this Recipe:
                    </Typography>
                    <Typography level="body-sm" color="neutral">
                      {recipe?.description ||
                        'No additional information available for this recipe.'}
                    </Typography>
                  </Box>
                );
              })()}
            </Box>

            {/* Right side: Dependencies and Hardware Requirements */}
            <Box
              id="recipe-right"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                minWidth: '300px',
                flex: 1,
              }}
            >
              {recipe?.requiredMachineArchitecture && (
                <Typography
                  level="title-lg"
                  mb={0}
                  endDecorator={
                    isHardwareCompatible ? (
                      <CircleCheckIcon
                        color="var(--joy-palette-success-400)"
                        size={20}
                      />
                    ) : (
                      <CircleXIcon
                        color="var(--joy-palette-danger-400)"
                        size={20}
                      />
                    )
                  }
                >
                  Hardware Requirements:
                </Typography>
              )}
              <ShowArchitectures
                architectures={recipe?.requiredMachineArchitecture}
              />
              <Typography level="body-sm" color="danger">
                {!isHardwareCompatible && 'Not compatible with your hardware.'}
              </Typography>
              <RecipeDependenciesWithProgress
                recipeId={recipe?.id}
                dependencies={data?.dependencies}
                dependenciesLoading={isLoading}
                dependenciesMutate={mutate}
                installationJobs={installationJobs}
                setInstallationJobs={setInstallationJobs}
              />
            </Box>
          </>
        )}
      </Box>
      <div style={{ width: '100%' }}>
        <Button
          size="lg"
          sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
          color="primary"
          startDecorator={<RocketIcon />}
          onClick={handleSubmit}
          disabled={
            experimentName === '' ||
            !experimentNameFormValue ||
            missingAnyDependencies ||
            isLoading
          }
        >
          Start &nbsp;
        </Button>
        <Typography
          level="body-sm"
          color="danger"
          sx={{ textAlign: 'center', mt: 0.5 }}
        >
          {experimentName === '' && 'Complete Step 1 to continue.'}
          {experimentName !== '' &&
            missingAnyDependencies &&
            'Install all missing dependencies before you can use this recipe.'}
          &nbsp;
          {!isHardwareCompatible &&
            'This recipe is not compatible with your hardware.'}
        </Typography>
      </div>
    </Sheet>
  );
}
