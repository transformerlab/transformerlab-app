import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Sheet,
  Typography,
} from '@mui/joy';
import { CircleCheckIcon, CircleXIcon, DownloadIcon } from 'lucide-react';

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

export default function RecipeDependencies({ recipe, installed }) {
  // Group dependencies by type
  const groupedDependencies = (recipe?.dependencies || []).reduce(
    (acc, dep) => {
      acc[dep.type] = acc[dep.type] || [];
      acc[dep.type].push(dep);
      return acc;
    },
    {},
  );

  // for now, if any item in the array called "installed" is false, we set loading to true
  // const loading = installed?.some((dep) => dep.installed === 'loading');
  // combinedState is loading if any are loading, false if any are false, and true if all are true
  let combinedState: boolean | 'loading' = 'loading';
  if (installed?.some((dep) => dep.installed === false)) {
    combinedState = false;
  } else if (installed?.every((dep) => dep.installed === true)) {
    combinedState = true;
  }

  function installedState(dep) {
    // find the dependency in the installed array
    if (!installed) return false;
    const installedDep = installed.find(
      (d) => d.type === dep.type && d.name === dep.name,
    );
    if (installedDep) {
      return installedDep.installed;
    }
    return false;
  }

  return (
    recipe?.dependencies &&
    recipe?.dependencies.length > 0 && (
      <>
        <Typography
          level="title-lg"
          mb={0}
          endDecorator={
            <>
              {combinedState === 'loading' && <CircularProgress size="sm" />}
              {combinedState === true && (
                <CircleCheckIcon
                  color="var(--joy-palette-success-400)"
                  size={20}
                />
              )}
              {combinedState === false && (
                <CircleXIcon color="var(--joy-palette-danger-400)" size={20} />
              )}
            </>
          }
        >
          Dependencies: ({recipe?.dependencies.length})
        </Typography>
        <Sheet
          variant="soft"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            p: 2,
            minWidth: '400px',
            minHeight: '60px',
            maxHeight: '300px',
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
                    <InstalledStateChip state={installedState(dep)} />
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Sheet>
        {combinedState === false && (
          <Button
            color="warning"
            size="sm"
            variant="plain"
            startDecorator={<DownloadIcon />}
          >
            Install Missing Dependencies
          </Button>
        )}
      </>
    )
  );
}
