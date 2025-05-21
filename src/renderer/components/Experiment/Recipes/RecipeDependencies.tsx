import { Box, Button, Chip, Sheet, Typography } from '@mui/joy';
import { CircleCheckIcon, DownloadIcon } from 'lucide-react';

export default function RecipeDependencies({ recipe }) {
  // Group dependencies by type
  const groupedDependencies = (recipe?.dependencies || []).reduce(
    (acc, dep) => {
      acc[dep.type] = acc[dep.type] || [];
      acc[dep.type].push(dep);
      return acc;
    },
    {},
  );
  return (
    recipe?.dependencies &&
    recipe?.dependencies.length > 0 && (
      <>
        <Typography
          level="title-lg"
          mb={0}
          endDecorator={
            <CircleCheckIcon color="var(--joy-palette-warning-400)" size={20} />
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
                    <Chip color="warning">not installed</Chip>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Sheet>
        <Button
          color="warning"
          size="sm"
          variant="plain"
          startDecorator={<DownloadIcon />}
        >
          Install Missing Dependencies
        </Button>
      </>
    )
  );
}
