import Typography from '@mui/joy/Typography';
import Checkbox from '@mui/joy/Checkbox';
import Box from '@mui/joy/Box';
import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
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
      <FormControl>
        <FormLabel>Experiment Name</FormLabel>
        <Input placeholder="alpha" />
      </FormControl>
      <Typography level="title-lg" mb={0}>
        Recipe Requirements:
      </Typography>
      <Box>
        {Object.entries(groupedDependencies).map(([type, deps]) => (
          <Box key={type} sx={{ mb: 2 }}>
            <Typography
              level="body-md"
              sx={{ textTransform: 'capitalize', mb: 1 }}
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
                  <Checkbox disabled checked sx={{ mr: 1 }} />
                  <Typography level="body-sm">{dep.name}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
      <Button>Install Missing Dependencies</Button>
      <Button disabled>Go (missing requirements)</Button>
    </>
  );
}
