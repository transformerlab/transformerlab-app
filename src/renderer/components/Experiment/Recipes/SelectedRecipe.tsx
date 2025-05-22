import { useEffect, useState } from 'react';
import {
  Button,
  Typography,
  Input,
  Box,
  Sheet,
  FormControl,
  FormLabel,
  FormHelperText,
} from '@mui/joy';
import { ArrowLeftIcon, CircleCheckIcon, RocketIcon } from 'lucide-react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';
import RecipeDependencies from './RecipeDependencies';

export default function SelectedRecipe({ recipe, setSelectedRecipeId }) {
  const [experimentName, setExperimentName] = useState('');
  const [installedDependencies, setInstalledDependencies] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!experimentName) return;
    // Submit logic here
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
        overflow: 'auto',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
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
          width: '100%',
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', md: 'row' },
          overflowY: 'auto',
          pt: 2,
          justifyContent: 'space-between',
        }}
        component="form"
        onSubmit={handleSubmit}
      >
        <Box>
          <FormControl required error={!experimentName}>
            <FormLabel>Give this experiment a unique name:</FormLabel>
            <Input
              size="lg"
              sx={{ width: '300px' }}
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              required
              name="experimentName"
            />
            {!experimentName && (
              <FormHelperText>This field is required.</FormHelperText>
            )}
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography
            level="title-lg"
            mb={0}
            endDecorator={
              <CircleCheckIcon
                color="var(--joy-palette-success-400)"
                size={20}
              />
            }
          >
            Hardware Requirements:
          </Typography>
          <ShowArchitectures
            architectures={recipe?.requiredMachineArchitecture}
          />
          <RecipeDependencies
            recipe={recipe}
            installed={installedDependencies}
          />
        </Box>
      </Box>

      <Button
        type="submit"
        size="lg"
        sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
        color="primary"
        startDecorator={<RocketIcon />}
        disabled={!experimentName}
      >
        Start (install missing dependencies first)
      </Button>
    </Sheet>
  );
}
