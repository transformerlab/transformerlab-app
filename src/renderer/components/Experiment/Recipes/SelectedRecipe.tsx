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

  // Check each dependency and see if it is installed
  useEffect(() => {
    if (recipe?.dependencies && recipe?.dependencies.length > 0) {
      // First go through each dependency and add it to the list of installed dependencies, setting each value to "loading"
      const dependencies = recipe.dependencies.map((dep) => ({
        ...dep,
        installed: 'loading',
      }));
      setInstalledDependencies(dependencies);

      // Check if models are installed
      const models = recipe.dependencies.filter((dep) => dep.type === 'model');
      // for each model, ask the backend if it is installed
      // For now we fake this with a 1-2 second delay
      setTimeout(() => {
        // Go through each model in the dependencies and set the installed value to true or false, randomly
        const updatedDependencies = dependencies.map((dep) => {
          if (dep.type === 'model') {
            return {
              ...dep,
              installed: Math.random() > 0.5,
            };
          }
          return dep;
        });
        setInstalledDependencies((prev) => {
          // Merge previous state with updated dependencies for plugins
          return prev
            ? prev.map((dep, idx) =>
                dep.type === 'model'
                  ? { ...dep, installed: updatedDependencies[idx].installed }
                  : dep,
              )
            : updatedDependencies;
        });
      }, 2000);

      // Now do the same for datasets:
      const datasets = recipe.dependencies.filter(
        (dep) => dep.type === 'dataset',
      );
      // for each dataset, ask the backend if it is installed
      // For now we fake this with a 1-2 second delay
      setTimeout(() => {
        // Go through each dataset in the dependencies and set the installed value to true or false, randomly
        const updatedDependencies = dependencies.map((dep) => {
          if (dep.type === 'dataset') {
            return {
              ...dep,
              installed: Math.random() > 0.5,
            };
          }
          return dep;
        });
        setInstalledDependencies((prev) => {
          // Merge previous state with updated dependencies for plugins
          return prev
            ? prev.map((dep, idx) =>
                dep.type === 'dataset'
                  ? { ...dep, installed: updatedDependencies[idx].installed }
                  : dep,
              )
            : updatedDependencies;
        });
      }, 1000);

      // Now do the same for plugins:
      const plugins = recipe.dependencies.filter(
        (dep) => dep.type === 'plugin',
      );
      // for each plugin, ask the backend if it is installed
      // For now we fake this with a 1-2 second delay
      setTimeout(() => {
        // Go through each plugin in the dependencies and set the installed value to true or false, randomly
        const updatedDependencies = dependencies.map((dep) => {
          if (dep.type === 'plugin') {
            return {
              ...dep,
              installed: Math.random() > 0.5,
            };
          }
          return dep;
        });
        setInstalledDependencies((prev) => {
          // Merge previous state with updated dependencies for plugins
          return prev
            ? prev.map((dep, idx) =>
                dep.type === 'plugin'
                  ? { ...dep, installed: updatedDependencies[idx].installed }
                  : dep,
              )
            : updatedDependencies;
        });
      }, 3000);

      // Now do the same for workflows:
      const workflows = recipe.dependencies.filter(
        (dep) => dep.type === 'workflow',
      );
      // for each plugin, ask the backend if it is installed
      // For now we fake this with a 1-2 second delay
      setTimeout(() => {
        // Go through each plugin in the dependencies and set the installed value to true or false, randomly
        const updatedDependencies = dependencies.map((dep) => {
          if (dep.type === 'workflow') {
            return {
              ...dep,
              installed: Math.random() > 0.5,
            };
          }
          return dep;
        });
        setInstalledDependencies((prev) => {
          // Merge previous state with updated dependencies for plugins
          return prev
            ? prev.map((dep, idx) =>
                dep.type === 'workflow'
                  ? { ...dep, installed: updatedDependencies[idx].installed }
                  : dep,
              )
            : updatedDependencies;
        });
      }, 2000);
    }
  }, [recipe]);

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
        component="form"
        onSubmit={handleSubmit}
      >
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
        <RecipeDependencies recipe={recipe} installed={installedDependencies} />
        <Button
          type="submit"
          size="lg"
          sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
          color="primary"
          startDecorator={<RocketIcon />}
          disabled={!experimentName}
        >
          Start
        </Button>
      </Box>
    </Sheet>
  );
}
