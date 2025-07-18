import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  List,
  ListItem,
  ListItemButton,
  Sheet,
} from '@mui/joy';
import Typography from '@mui/joy/Typography';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk'; // Adjust the import path as necessary
import RecipeCard from './RecipeCard';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ListRecipes({
  setSelectedRecipe,
  close,
  showRecentExperiments = true,
}) {
  const [allExperiments, setAllExperiments] = useState<
    Array<{ name: string; id: number }>
  >([]);
  const { setExperimentId } = useExperimentInfo();

  // This gets all the available experiments
  const { data: experimentsAll } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.GetAll(),
    fetcher,
  );

  // get all experiments on mount
  useEffect(() => {
    async function fetchAllExperiments() {
      if (!Array.isArray(experimentsAll)) {
        console.error('experimentsAll is not an array:', experimentsAll);
        return;
      }

      // Get all experiments and map them to the required format
      const experiments = experimentsAll.map((exp) => ({
        name: exp.name,
        id: exp.id,
      }));

      setAllExperiments(experiments);
    }
    fetchAllExperiments();
  }, [experimentsAll]);

  const { data, isLoading } = useAPI('recipes', ['getAll']);

  const { data: serverInfo } = useAPI('server', ['info']);

  // Sort data by an extra field called zOrder if it exists, put all
  // recipes without zOrder at the end
  const sortedData = data?.sort((a, b) => {
    if (a.zOrder !== undefined && b.zOrder !== undefined) {
      return a.zOrder - b.zOrder;
    } else if (a.zOrder !== undefined) {
      return -1; // a comes first
    } else if (b.zOrder !== undefined) {
      return 1; // b comes first
    } else {
      return 0; // keep original order
    }
  });

  return (
    <>
      <Typography level="h2">👋 Welcome to Transformer Lab!</Typography>
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 3,
          overflowY: 'hidden',
        }}
      >
        {showRecentExperiments && (
          <Sheet
            sx={{
              overflow: 'hidden',
              borderRadius: 'md',
              width: '240px',
            }}
            variant="soft"
            color="neutral"
          >
            <Typography level="h4" mb={1} pt={2} px={2}>
              Saved Experiments
            </Typography>
            <Box
              sx={{
                overflowY: 'auto',
                overflowX: 'hidden',
                maxHeight: '100%',
                p: 1,
                scrollbarWidth: 'thin',
                scrollbarColor:
                  'var(--joy-palette-background-level3) transparent',
              }}
            >
              <List
                sx={{
                  width: 160,
                }}
                component="nav"
              >
                {allExperiments.length === 0 && (
                  <ListItem>
                    <ListItemButton disabled>No experiments yet</ListItemButton>
                  </ListItem>
                )}

                {allExperiments.map(
                  (experiment, idx) =>
                    experiment && (
                      <ListItem
                        key={experiment.id ?? idx}
                        onClick={() => {
                          setExperimentId(experiment?.id);
                          close();
                        }}
                      >
                        <ListItemButton
                          title={experiment?.name}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          variant="soft"
                        >
                          <span
                            style={{
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              display: 'block',
                              width: '100%',
                            }}
                          >
                            {experiment?.name}
                          </span>
                        </ListItemButton>
                      </ListItem>
                    ),
                )}
              </List>
            </Box>
          </Sheet>
        )}
        <Sheet
          variant="soft"
          color="primary"
          sx={{
            width: '100%',
            height: '100%',
            p: 2,
            overflowY: 'auto',
            borderRadius: 'md',
          }}
        >
          <Typography level="h4">Start Something New!</Typography>
          <Grid
            container
            spacing={2}
            sx={{
              flexGrow: 1,
              justifyContent: 'flext-start',
              alignContent: 'flex-start',
              overflow: 'auto',
              maxWidth: '1000px' /* Adjust this to your desired max width */,
              margin: '0 auto',
            }}
          >
            <RecipeCard
              recipeDetails={{
                id: -1,
                title: 'Create an Empty Experiment',
                description: 'Start from scratch',
                cardImage: 'https://recipes.transformerlab.net/cleanlab.jpg',
              }}
              setSelectedRecipe={setSelectedRecipe}
            />
            {isLoading && <CircularProgress />}
            {Array.isArray(sortedData) &&
              sortedData.map((recipe) => (
                <RecipeCard
                  recipeDetails={recipe}
                  setSelectedRecipe={setSelectedRecipe}
                />
              ))}
          </Grid>
          <Alert color="primary" variant="soft">
            Your machine&apos;s architecture is &quot;{serverInfo?.device_type}
            &quot;. To see more recipes, try this app on a computer with a
            different GPU.
          </Alert>
        </Sheet>
      </Sheet>
    </>
  );
}
