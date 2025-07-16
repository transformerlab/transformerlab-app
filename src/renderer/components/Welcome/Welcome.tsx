/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Sheet,
  Typography,
  CircularProgress,
  Alert,
  Grid,
  Modal,
  ModalDialog,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { getAPIFullPath, useAPI } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

import labImage from './img/lab.jpg';
import DownloadFirstModelModal from '../DownloadFirstModelModal';
import HexLogo from '../Shared/HexLogo';
import RecipeCard from '../Experiment/Recipes/RecipeCard';
import SelectedRecipe, {
  isRecipeCompatibleWithDevice,
} from '../Experiment/Recipes/SelectedRecipe';

export default function Welcome() {
  // For now disable ModelDownloadModal
  const [modelDownloadModalOpen, setModelDownloadModalOpen] =
    useState<boolean>(false);

  // State for recipe selection
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [isCreatingExperiment, setIsCreatingExperiment] =
    useState<boolean>(false);

  const { server, isLoading, isError } = chatAPI.useServerStats();
  const { data: recipes, isLoading: recipesLoading } = useAPI('recipes', [
    'getAll',
  ]);
  const { data: serverInfo } = useAPI('server', ['info']);
  const { setExperimentId } = useExperimentInfo();
  const navigate = useNavigate();

  const createNewExperiment = useCallback(
    async (fromRecipeId: number | null, name: string) => {
      if (fromRecipeId === -1) {
        // This means user clicked on Create BLANK experiment
        try {
          const response = await fetch(
            chatAPI.Endpoints.Experiment.Create(name),
          );
          const newId = await response.json();
          setExperimentId(newId);
          setSelectedRecipe(null);
          navigate('/experiment/model');
        } catch (error) {
          // Handle error silently
        }
        return { jobs: [] };
      }

      setIsCreatingExperiment(true);

      try {
        const response = await fetch(
          getAPIFullPath('recipes', ['createExperiment'], {
            id: fromRecipeId,
            experiment_name: name,
          }),
          {
            method: 'POST',
          },
        );
        const responseJson = await response.json();
        if (!(responseJson?.status === 'success')) {
          return { jobs: [] };
        }
        const newId = responseJson?.data?.experiment_id;
        setExperimentId(newId);

        // Wait a moment to show the loading state
        await new Promise((resolve) => {
          setTimeout(resolve, 1500);
        });

        setIsCreatingExperiment(false);
        setSelectedRecipe(null);
        navigate('/experiment/model');

        return responseJson;
      } catch (error) {
        setIsCreatingExperiment(false);
        setSelectedRecipe(null);
        return { jobs: [] };
      }
    },
    [setExperimentId, navigate],
  );

  // Sort recipes data by zOrder
  const sortedRecipes = recipes?.sort((a: any, b: any) => {
    if (a.zOrder !== undefined && b.zOrder !== undefined) {
      return a.zOrder - b.zOrder;
    }
    if (a.zOrder !== undefined) {
      return -1;
    }
    if (b.zOrder !== undefined) {
      return 1;
    }
    return 0;
  });

  return (
    <>
      <DownloadFirstModelModal
        open={modelDownloadModalOpen}
        setOpen={setModelDownloadModalOpen}
        server={server}
      />

      {/* Show Selected Recipe Modal if one is chosen */}
      <Modal open={!!selectedRecipe} onClose={() => setSelectedRecipe(null)}>
        <ModalDialog
          sx={{
            width: '60vw',
            height: '80vh',
            overflow: 'auto',
            p: 0,
          }}
        >
          {isCreatingExperiment && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                flexDirection: 'column',
              }}
            >
              <Typography level="body-lg" sx={{ mb: 2 }}>
                Setting up new experiment...
              </Typography>
              <CircularProgress />
            </div>
          )}
          {!isCreatingExperiment && selectedRecipe && (
            <SelectedRecipe
              recipe={selectedRecipe}
              setSelectedRecipeId={setSelectedRecipe}
              installRecipe={createNewExperiment}
            />
          )}
        </ModalDialog>
      </Modal>

      <Sheet
        sx={{
          overflow: 'hidden',
          height: 'calc(100% - 1em)',
          backgroundImage: `url("${labImage}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 3,
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--joy-palette-background-surface)',
            opacity: '0.95',
            padding: '2rem',
            paddingTop: '60px',
            overflowY: 'auto',
            height: '100%',
            marginTop: '60px',
          }}
        >
          <Typography
            level="h1"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
          >
            <HexLogo width={40} height={40} /> Transformer Lab
          </Typography>

          {/* Recipes Content */}
          {!isLoading && !isError && server && (
            <>
              <Typography
                level="h2"
                sx={{ fontWeight: 400, color: 'text.secondary', mb: 3 }}
              >
                What do you want to do?
              </Typography>

              {/* Recipes Grid */}
              <Grid
                container
                spacing={2}
                sx={{
                  flexGrow: 1,
                  justifyContent: 'flex-start',
                  alignContent: 'flex-start',
                  overflow: 'auto',
                  maxWidth: '1000px',
                  margin: '0 auto',
                }}
              >
                {/* Empty Experiment Card */}
                <RecipeCard
                  recipeDetails={{
                    id: -1,
                    title: 'Create an Empty Experiment',
                    description: 'Start from scratch',
                    cardImage:
                      'https://recipes.transformerlab.net/cleanlab.jpg',
                  }}
                  setSelectedRecipe={setSelectedRecipe}
                />

                {recipesLoading && <CircularProgress />}

                {/* Recipe Cards */}
                {Array.isArray(sortedRecipes) &&
                  sortedRecipes
                    .filter((recipe) =>
                      isRecipeCompatibleWithDevice(
                        recipe,
                        serverInfo?.device_type,
                      ),
                    )
                    .map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipeDetails={recipe}
                        setSelectedRecipe={setSelectedRecipe}
                      />
                    ))}
              </Grid>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
