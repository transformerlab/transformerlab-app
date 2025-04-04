/* eslint-disable react/require-default-props */
import {
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  IconButton,
  Typography,
} from '@mui/joy';
import { HeartIcon } from 'lucide-react';

export default function RecipeCard({
  recipeDetails,
  actionOveride = null,
}: {
  recipeDetails: { title: string; description: string };
  actionOveride?: (() => void) | null;
}) {
  return (
    <Card
      variant="soft"
      sx={{
        // width: '300px',
        height: '220px',
        border: '1px solid',
        borderColor: 'neutral.outlinedBorder',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* <Avatar src="" size="lg" /> */}
      </Box>
      <CardContent>
        <Typography
          level="title-lg"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {recipeDetails?.title}
        </Typography>
        <Typography
          level="body-sm"
          sx={{
            height: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {recipeDetails?.description}
        </Typography>
      </CardContent>
      <CardActions buttonFlex="0 1 120px">
        <IconButton variant="plain" color="neutral" sx={{ mr: 'auto' }}>
          <HeartIcon size="20px" />
        </IconButton>
        <Button variant="plain" color="neutral">
          Info
        </Button>
        <Button
          variant="solid"
          color="primary"
          onClick={
            actionOveride ||
            (() => {
              alert('Action not implemented');
            })
          }
        >
          Start
        </Button>
      </CardActions>
    </Card>
  );
}
