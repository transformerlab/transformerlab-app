import {
  Button,
  FormControl,
  FormLabel,
  Typography,
  Input,
  Box,
  Checkbox,
  Sheet,
  Chip,
} from '@mui/joy';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  DownloadIcon,
  RocketIcon,
} from 'lucide-react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';

export default function SelectedRecipe({ recipe, setSelectedRecipeId }) {
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
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: '100%',
        height: '100%',
        overflow: 'auto',
        alignItems: 'flex-start',
      }}
    >
      <Typography level="h2">
        <Button
          size="sm"
          variant="plain"
          onClick={() => {
            setSelectedRecipeId(null);
          }}
        >
          <ArrowLeftIcon />
        </Button>
        {recipe?.title}
      </Typography>
      <Box
        id="recipe-details"
        sx={{
          width: '80%',
          display: 'flex',
          gap: 1,
          flexDirection: 'column',
          p: 3,
          margin: 'auto',
        }}
      >
        {/* <Typography level="body-md" mb={1}>
        {recipe?.description}
      </Typography> */}
        <Typography level="title-lg" mb={0}>
          Give this experiment a unique name:
        </Typography>
        <Input placeholder="alpha" size="lg" sx={{ width: '300px' }} />
        <Typography
          level="title-lg"
          mb={0}
          endDecorator={
            <CircleCheckIcon color="var(--joy-palette-success-400)" size={20} />
          }
          mt={2}
        >
          Hardware Requirements:
        </Typography>
        <ShowArchitectures
          architectures={recipe?.requiredMachineArchitecture}
        />
        {recipe?.dependencies && recipe?.dependencies.length > 0 && (
          <>
            <Typography
              level="title-lg"
              mb={0}
              endDecorator={
                <CircleCheckIcon
                  color="var(--joy-palette-warning-400)"
                  size={20}
                />
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
                  <Typography
                    level="title-md"
                    sx={{ textTransform: 'capitalize' }}
                  >
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
        )}
      </Box>
      <Button
        size="lg"
        disabled
        sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
        color="primary"
        startDecorator={<RocketIcon />}
      >
        Start (missing requirements)
      </Button>
    </Sheet>
  );
}
