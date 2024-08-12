import { Box, FormLabel, Input, Sheet, Stack } from '@mui/joy';
import { useState } from 'react';
import ThinSlider from './ThinSlider';

export default function MainGenerationConfigKnobs({
  generationParameters,
  setGenerationParameters,
  tokenCount,
  defaultPromptConfigForModel,
  showAllKnobs = true,
}) {
  return (
    <>
      <Sheet sx={{ display: 'flex', flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
          <ThinSlider
            title="Temperature"
            value={generationParameters?.temperature}
            onChange={(event: Event, newValue: number | number[]) => {
              setGenerationParameters({
                ...generationParameters,
                temperature: newValue as number,
              });
            }}
            max={2}
            min={0}
            step={0.01}
            valueLabelDisplay="auto"
          />
          {/* <FormHelperText>This is a helper text.</FormHelperText> */}
        </Box>
        <Box sx={{ flex: 1, minWidth: '200px' }}>
          <ThinSlider
            title="Maximum Length"
            value={generationParameters?.maxTokens}
            onChange={(e, newValue) => {
              setGenerationParameters({
                ...generationParameters,
                maxTokens: newValue as number,
              });
            }}
            max={
              tokenCount?.contextLength
                ? parseInt(tokenCount.contextLength)
                : 1024
            }
            min={0}
            valueLabelDisplay="auto"
          />
        </Box>
        {showAllKnobs && (
          <Box sx={{ flex: 1, minWidth: '200px' }}>
            <ThinSlider
              title="Top P"
              value={generationParameters?.topP}
              onChange={(event: Event, newValue: number | number[]) => {
                setGenerationParameters({
                  ...generationParameters,
                  topP: newValue as number,
                });
              }}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
            />
          </Box>
        )}
        {showAllKnobs && (
          <Box sx={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
            <ThinSlider
              title="Frequency Penalty"
              value={generationParameters?.frequencyPenalty}
              onChange={(event: Event, newValue: number | number[]) => {
                setGenerationParameters({
                  ...generationParameters,
                  frequencyPenalty: newValue as number,
                });
              }}
              max={2}
              min={-2}
              step={0.2}
              valueLabelDisplay="auto"
            />
          </Box>
        )}
      </Sheet>
    </>
  );
}
