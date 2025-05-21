import { Button, Typography, Input, Box, Sheet } from '@mui/joy';
import { ArrowLeftIcon, CircleCheckIcon, RocketIcon } from 'lucide-react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';
import RecipeDependencies from './RecipeDependencies';

export default function SelectedRecipe({ recipe, setSelectedRecipeId }) {
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
        <RecipeDependencies recipe={recipe} />
      </Box>
      <Button
        size="lg"
        disabled
        sx={{ mt: 2, width: '100%', alignSelf: 'flex-end' }}
        color="primary"
        startDecorator={<RocketIcon />}
      >
        Start (install missing dependencies first)
      </Button>
    </Sheet>
  );
}
