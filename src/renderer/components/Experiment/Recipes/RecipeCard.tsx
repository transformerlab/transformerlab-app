import {
  AspectRatio,
  Button,
  Card,
  CardContent,
  CardOverflow,
  Divider,
  Grid,
  Typography,
} from '@mui/joy';
import { ArrowRightIcon } from 'lucide-react';
import React from 'react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';
import { isRecipeCompatibleWithDevice } from './SelectedRecipe';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';

interface RecipeCardProps {
  recipeDetails: RecipeDetails;
  setSelectedRecipe: (recipeId: number | undefined) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({
  recipeDetails,
  setSelectedRecipe,
}) => {
  const { data: serverInfo } = useAPI('server', ['info']);
  const machineType = serverInfo?.device_type;

  const isCompatible = isRecipeCompatibleWithDevice(recipeDetails, machineType);

  if (!isCompatible) {
    return null;
  }

  return (
    <Grid key={recipeDetails.id} sx={{ width: '250px' }}>
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardOverflow>
          <AspectRatio ratio="8/3">
            <img src={recipeDetails?.cardImage} loading="lazy" alt="" />
          </AspectRatio>
        </CardOverflow>
        <CardContent>
          <Typography level="title-md">{recipeDetails?.title}</Typography>
          <Typography level="body-xs" fontWeight="sm">
            {recipeDetails?.description}
          </Typography>
        </CardContent>
      </CardOverflow>
    </Card>
  );
};

export default RecipeCard;
