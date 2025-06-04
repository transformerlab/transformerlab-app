import { useState } from 'react';
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
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleXIcon,
  RocketIcon,
} from 'lucide-react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import RecipeDependencies from './RecipeDependencies';

function isRecipeCompatibleWithDevice(recipe, device) {
  if (!recipe?.requiredMachineArchitecture) return true;
  if (!device) return false;

  if (device === 'mps') {
    return (
      recipe.requiredMachineArchitecture.includes('mlx') ||
      recipe.requiredMachineArchitecture.includes('cpu')
    );
  }
  if (device === 'cuda') {
    return (
      recipe.requiredMachineArchitecture.includes('cuda') ||
      recipe.requiredMachineArchitecture.includes('cpu')
    );
  }
  if (device === 'cpu') {
    return recipe.requiredMachineArchitecture.includes('cpu');
  }

  return false;
}

export default function SelectedRecipe({
  recipe,
  setSelectedRecipeId,
  installRecipe,
}) {
  const [experimentName, setExperimentName] = useState('');
  const [experimentNameTouched, setExperimentNameTouched] = useState(false);

  const { data, isLoading, mutate } = useAPI('recipes', ['checkDependencies'], {
    id: recipe?.id,
  });

  const { data: serverInfo } = useAPI('server', ['info']);
  const device = serverInfo?.device;

  // Check if all dependencies are installed
  let missingAnyDependencies = false;
  if (data?.dependencies) {
    missingAnyDependencies = data.dependencies.some((dep) => {
      // check if dep.installed === true
      return dep.installed === false;
    });
  }

  const isHardwareCompatible = isRecipeCompatibleWithDevice(recipe, device);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Installing recipe:', recipe?.id);
    installRecipe(recipe?.id, experimentName);
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
          overflowY: 'hidden',
          overflowX: 'hidden',
          pt: 2,
          justifyContent: 'space-between',
          maxWidth: '800px',
          margin: '0 auto',
        }}
        onSubmit={handleSubmit}
      >
        <Box id="recipe-left" sx={{ overflowY: 'auto', padding: 1 }}>
          <FormControl
            required
            error={!experimentName && experimentNameTouched}
          >
            <FormLabel sx={{ fontWeight: 'regular' }}>
              Give this experiment a unique name:
            </FormLabel>
            <Input
              size="lg"
              sx={{ width: '300px' }}
              value={experimentName}
              onChange={(e) => {
                setExperimentName(e.target.value);
                if (!experimentNameTouched) setExperimentNameTouched(true);
              }}
              onBlur={() => setExperimentNameTouched(true)}
              required
              name="experimentName"
            />
            {!experimentName && experimentNameTouched && (
              <FormHelperText>This field is required.</FormHelperText>
            )}
          </FormControl>
        </Box>
        <Box
          id="recipe-right"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minWidth: '300px',
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
          <RecipeDependencies
            recipeId={recipe?.id}
            dependencies={data?.dependencies}
            dependenciesLoading={isLoading}
            dependenciesMutate={mutate}
          />
        </Box>
      </Box>
      <div style={{ width: '100%' }}>
        <Button
          size="lg"
          sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
          color="primary"
          startDecorator={<RocketIcon />}
          onClick={handleSubmit}
          disabled={!experimentName || missingAnyDependencies || isLoading}
        >
          Start &nbsp;
        </Button>
        <Typography
          level="body-sm"
          color="danger"
          sx={{ textAlign: 'center', mt: 0.5 }}
        >
          {missingAnyDependencies &&
            'Install all missing dependencies before you can use this recipe.'}
          &nbsp;
          {!isHardwareCompatible &&
            'This recipe is not compatible with your hardware.'}
        </Typography>
      </div>
    </Sheet>
  );
}
