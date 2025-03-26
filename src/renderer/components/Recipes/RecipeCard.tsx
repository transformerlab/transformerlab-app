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
import { useState, useEffect } from 'react';

const RecipeCard: React.FC = () => {
  return (
    <Card
      variant="outlined"
      sx={{
        width: 320,
        overflow: 'auto',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Avatar src="" size="lg" />
      </Box>
      <CardContent>
        <Typography level="title-lg">Train a Model From Scratch</Typography>
        <Typography level="body-sm">
          Use Nanotron to train a model from scratch. It's great.
        </Typography>
      </CardContent>
      <CardActions buttonFlex="0 1 120px">
        <IconButton variant="outlined" color="neutral" sx={{ mr: 'auto' }}>
          <HeartIcon size="20px" />
        </IconButton>
        <Button variant="outlined" color="neutral">
          Info
        </Button>
        <Button variant="solid" color="primary">
          Start
        </Button>
      </CardActions>
    </Card>
  );
};

export default RecipeCard;
