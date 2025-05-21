import Typography from '@mui/joy/Typography';

export default function SelectedRecipe({ recipe, setSelectedRecipe }) {
  return (
    <>
      <Typography level="h2" mb={2}>
        Recipe: {recipe?.title}
      </Typography>
      {JSON.stringify(recipe)}
    </>
  );
}
