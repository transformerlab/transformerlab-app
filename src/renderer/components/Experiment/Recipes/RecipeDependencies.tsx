import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Sheet,
  Typography,
} from '@mui/joy';
import { get } from 'http';
import { CircleCheckIcon, CircleXIcon, DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';

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
  // Group dependencies by type
  const groupedDependencies = (dependencies || []).reduce((acc, dep) => {
    acc[dep.type] = acc[dep.type] || [];
    acc[dep.type].push(dep);
    return acc;
  }, {});

  // Check if all dependencies are installed
  const combinedState = dependencies?.every((dep) => {
    // check if dep.installed === true
    return dep.installed === true;
  });

  return (
    dependencies &&
    dependencies.length > 0 && (
      <>
        <Typography
          level="title-lg"
          mb={0}
          endDecorator={
            <>
              {dependenciesLoading && <CircularProgress size="sm" />}
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
          Dependencies: ({dependencies.length})
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
          {/* {installing && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                pointerEvents: 'auto',
                background: 'rgba(255,255,255,0.3)',
              }}
            >
              <CircularProgress />
            </Box>
          )} */}
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
        {combinedState === false && (
          <Button
            color="warning"
            size="sm"
            variant="plain"
            startDecorator={
              installing ? <CircularProgress size="sm" /> : <DownloadIcon />
            }
            onClick={async () => {
              setInstalling(true);
              await fetch(
                getFullPath('recipes', ['installDependencies'], {
                  id: recipeId,
                }),
              );
              dependenciesMutate();
              setInstalling(false);
            }}
          >
            Install Missing Dependencies
          </Button>
        )}
      </>
    )
  );
}
