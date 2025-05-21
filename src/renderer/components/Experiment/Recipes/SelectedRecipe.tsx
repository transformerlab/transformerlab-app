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
import { ArrowLeftIcon } from 'lucide-react';

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
    <>
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
      <Typography level="body-md" mb={1}>
        {recipe?.description}
      </Typography>
      <Typography level="title-lg" mb={0}>
        Name:
      </Typography>
      <Input placeholder="alpha" size="lg" sx={{ maxWidth: '300px' }} />
      <Typography level="title-lg" mb={0}>
        Recipe Requirements:
      </Typography>
      {recipe?.dependencies && recipe?.dependencies.length > 0 && (
        <>
          <Sheet
            variant="soft"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              p: 1,
            }}
          >
            {Object.entries(groupedDependencies).map(([type, deps]) => (
              <Box key={type} sx={{ mb: 0 }}>
                <Typography
                  level="title-md"
                  sx={{ textTransform: 'capitalize' }}
                >
                  {type}s
                </Typography>
                <Box component="ul" sx={{ pl: 2 }}>
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
          <Button color="warning" variant="soft">
            Install Missing Dependencies
          </Button>
        </>
      )}
      <Button disabled>Go (missing requirements)</Button>
    </>
  );
}
