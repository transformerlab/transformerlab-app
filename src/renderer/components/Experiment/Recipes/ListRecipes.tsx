import { Grid } from '@mui/joy';
import Typography from '@mui/joy/Typography';
import RecipeCard from './RecipeCard';

export default function ListRecipes({ recipeDetails, setSelectedRecipe }) {
  return (
    <>
      <Typography level="h2" mb={2}>
        👋 Welcome to Transformer Lab! What do you want to do?
      </Typography>
      <Grid
        container
        spacing={2}
        sx={{
          flexGrow: 1,
          justifyContent: 'flext-start',
          alignContent: 'flex-start',
          overflow: 'auto',
        }}
      >
        <Grid key={-1}>
          <RecipeCard
            recipeDetails={{
              id: -1,
              title: 'Create a Blank Experiment',
              description: '',
              cardImage:
                'https://images.unsplash.com/photo-1559311648-d46f5d8593d6?auto=format&fit=crop&w=318',
            }}
            setSelectedRecipe={setSelectedRecipe}
          />
        </Grid>
        {recipeDetails.map((recipe) => (
          <Grid key={recipe.id}>
            <RecipeCard
              recipeDetails={recipe}
              setSelectedRecipe={setSelectedRecipe}
            />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
