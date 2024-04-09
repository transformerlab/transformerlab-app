import { Box, FormLabel, Sheet, Stack } from '@mui/joy';
import { useState } from 'react';
import ThinSlider from './ThinSlider';

export default function MainGenerationConfigKnobs({
  generationParameters,
  setGenerationParameters,
  tokenCount,
  defaultPromptConfigForModel,
}) {
  return (
    <>
      <Sheet sx={{ display: 'flex', flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
          <FormLabel>
            Temperature &nbsp;
            <span style={{ color: '#aaa' }}>
              {generationParameters?.temperature}
            </span>
          </FormLabel>
          <ThinSlider
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
          <FormLabel>
            Maximum Length &nbsp;
            <span style={{ color: '#aaa' }}>
              {generationParameters?.maxTokens}
            </span>
          </FormLabel>
          <ThinSlider
            defaultValue={1024}
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
        <Box sx={{ flex: 1, minWidth: '200px' }}>
          <FormLabel>
            Top P &nbsp;
            <span style={{ color: '#aaa' }}>{generationParameters?.topP}</span>
          </FormLabel>
          <ThinSlider
            value={generationParameters?.topP}
            onChange={(event: Event, newValue: number | number[]) => {
              setGenerationParameters({
                ...generationParameters,
                topP: newValue as number,
              });
            }}
            defaultValue={1.0}
            max={1}
            step={0.01}
            valueLabelDisplay="auto"
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
          <FormLabel>
            Frequency Penalty &nbsp;
            <span style={{ color: '#aaa' }}>
              {generationParameters?.frequencyPenalty}
            </span>
          </FormLabel>
          <ThinSlider
            value={generationParameters?.frequencyPenalty}
            onChange={(event: Event, newValue: number | number[]) => {
              setGenerationParameters({
                ...generationParameters,
                frequencyPenalty: newValue as number,
              });
            }}
            defaultValue={0}
            max={2}
            min={-2}
            step={0.2}
            valueLabelDisplay="auto"
          />
        </Box>
      </Sheet>
    </>
  );
}
