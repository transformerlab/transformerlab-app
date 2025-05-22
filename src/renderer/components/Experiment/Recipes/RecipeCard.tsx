import {
  AspectRatio,
  Button,
  Card,
  CardContent,
  CardOverflow,
  Divider,
  Typography,
} from '@mui/joy';
import { ArrowRightIcon } from 'lucide-react';
import React from 'react';
import ShowArchitectures from 'renderer/components/Shared/ListArchitectures';

interface RecipeCardProps {
  recipeDetails: RecipeDetails;
  setSelectedRecipe: (recipeId: number | undefined) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = ({
  recipeDetails,
  setSelectedRecipe,
}) => {
  return (
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
      <CardOverflow variant="soft" sx={{ bgcolor: 'background.level1' }}>
        <Divider inset="context" />
        <CardContent
          orientation="horizontal"
          sx={{ justifyContent: 'flex-end' }}
        >
          {recipeDetails?.requiredMachineArchitecture &&
            recipeDetails?.requiredMachineArchitecture.length > 0 && (
              <Typography
                level="body-xs"
                textColor="text.secondary"
                sx={{ fontWeight: 'md', display: 'flex', alignItems: 'center' }}
              >
                <ShowArchitectures
                  architectures={recipeDetails?.requiredMachineArchitecture}
                />
              </Typography>
            )}
          <Divider orientation="vertical" />
          <Button
            size="sm"
            color="primary"
            variant="solid"
            sx={{
              height: '28px',
              minHeight: '28px',
              /* make it impossible for the text to wrap: */
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            endDecorator={<ArrowRightIcon size={16} strokeWidth={1} />}
            onClick={() => {
              setSelectedRecipe(recipeDetails);
            }}
          >
            Let&apos;s Go!
          </Button>
        </CardContent>
      </CardOverflow>
    </Card>
  );
};

export default RecipeCard;
