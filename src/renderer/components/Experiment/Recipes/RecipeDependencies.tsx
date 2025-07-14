import {
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Sheet,
  Typography,
} from '@mui/joy';
import { CircleCheckIcon, CircleXIcon, DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { useEffect } from 'react';

function InstalledStateChip({ state }) {
  let color = 'neutral';
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
}

export default function RecipeDependencies({
  recipeId,
  dependencies,
  dependenciesLoading,
  dependenciesMutate,
}) {
  const [installing, setInstalling] = useState(false);
  const [installJobId, setInstallJobId] = useState(null);
  const [dependenciesFromInstall, setDependenciesFromInstall] = useState(null);
  const { data } = useAPI(
    'recipes',
    ['jobStatus'],
    {
      job_id: installJobId,
    },
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    if (data?.results && data?.results.length > 0) {
      setDependenciesFromInstall(data.results);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (dependenciesLoading) return <CircularProgress sx={{ mt: 1, mb: 1 }} />;

  if (!dependencies) {
    return null;
  }

  const installStatus = data?.status;
  const installProgress = data?.progress;

  if (installStatus === 'COMPLETE') {
    setInstallJobId(null);
    setInstalling(false);
    dependenciesMutate();
  }

  const dependenciesToGroup = /* dependenciesFromInstall || */ dependencies;

  // Group dependencies by type
  const groupedDependencies = (dependenciesToGroup || []).reduce((acc, dep) => {
    acc[dep.type] = acc[dep.type] || [];
    acc[dep.type].push(dep);
    return acc;
  }, {});

  const countMissingDependencies = dependencies?.filter(
    (dep) => dep.installed === false,
  ).length;

  return (
    dependencies &&
    dependencies.length > 0 && (
      <>
        {/* {JSON.stringify(dependenciesFromInstall)} */}
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
            opacity: installing ? 0.5 : 1,
            pointerEvents: installing ? 'none' : 'auto',
          }}
        >
          {Object.entries(groupedDependencies).map(([type, deps]) => (
            <Box key={type} sx={{ mb: 1 }}>
              <Typography level="title-md" sx={{ textTransform: 'capitalize' }}>
                {type}s
              </Typography>
              <Box sx={{ pl: 2 }}>
                {deps.map((dep, idx) => (
                  <Box
                    component="li"
                    key={dep.name}
                    sx={{ display: 'flex', alignItems: 'center', mb: 1 }}
                  >
                    <Typography level="body-sm" mr={1}>
                      {dep.name}
                    </Typography>
                    <InstalledStateChip state={dep?.installed} />
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Sheet>
        {installing && (
          <LinearProgress
            determinate
            variant="soft"
            value={installProgress}
            sx={{}}
          />
        )}
        {countMissingDependencies > 0 && (
          <Button
            color="warning"
            size="sm"
            variant="plain"
            startDecorator={
              installing ? <CircularProgress size="sm" /> : <DownloadIcon />
            }
            onClick={async () => {
              setInstalling(true);
              const installTask = await fetch(
                getAPIFullPath('recipes', ['installDependencies'], {
                  id: recipeId,
                }),
              );
              const installTaskJson = await installTask.json();
              if (installTaskJson?.job_id) {
                setInstallJobId(installTaskJson.job_id);
              }
            }}
          >
            Install ({countMissingDependencies}) Missing Dependenc
            {countMissingDependencies === 1 ? 'y' : 'ies'}
          </Button>
        )}
      </>
    )
  );
}
