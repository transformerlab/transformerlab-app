import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Sheet,
  Stack,
  Textarea,
  Typography,
  Card,
} from '@mui/joy';
import { SendIcon, StopCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';

export default function TextDiffusionVisualization({
  tokenCount,
  stopStreaming,
  generationParameters,
  setGenerationParameters,
  defaultPromptConfigForModel,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfo,
  experimentInfoMutate,
}) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [masksRemaining, setMasksRemaining] = useState(0);
  const [error, setError] = useState(null);
  const [stepHistory, setStepHistory] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  const abortControllerRef = useRef(null);

  // Clean up fetch when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedText('');
    setCurrentStep(0);
    setTotalSteps(0);
    setMasksRemaining(0);
    setStepHistory([]);
    setStartTime(Date.now());
    setTimeRemaining(null);

    // Abort any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const model = experimentInfo?.config?.foundation;
      const adaptor = experimentInfo?.config?.adaptor;
      const url = `${chatAPI.INFERENCE_SERVER_URL()}v1/text_diffusion`;

      const data = {
        model: model?.split('/').slice(-1)[0],
        adaptor: adaptor,
        prompt: prompt,
        max_tokens: generationParameters?.maxTokens || 128,
        temperature: generationParameters?.temperature || 0.0,
        top_p: generationParameters?.topP || 1.0,
      };

      // Make fetch request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(data),
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      // Process the stream
      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            setIsGenerating(false);
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete chunk in the buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6); // Remove 'data: ' prefix

              if (data === '[DONE]') {
                setIsGenerating(false);
                return;
              }

              try {
                const parsedData = JSON.parse(data);

                if (parsedData.error) {
                  setError(parsedData.error);
                  setIsGenerating(false);
                  return;
                }

                // Extract text and diffusion metadata from the response
                // The new /v1/text_diffusion endpoint returns data directly
                const text = parsedData.text || '';
                const diffusionStep = parsedData.diffusion_step;
                const totalStepsData = parsedData.total_steps;
                const masksRemainingData = parsedData.masks_remaining;

                // Always update text if present (even if empty) to show evolution
                // This ensures we see each step of the diffusion process
                if (text !== undefined && text !== null) {
                  setGeneratedText(text);
                }
                
                // Update step information if available
                if (diffusionStep !== undefined) {
                  setCurrentStep(diffusionStep);
                  
                  // Calculate time remaining
                  if (totalStepsData !== undefined && totalStepsData > 0 && startTime) {
                    const elapsed = (Date.now() - startTime) / 1000; // seconds
                    const avgTimePerStep = elapsed / diffusionStep;
                    const remainingSteps = totalStepsData - diffusionStep;
                    const estimatedRemaining = remainingSteps * avgTimePerStep;
                    setTimeRemaining(estimatedRemaining);
                  }
                }
                if (totalStepsData !== undefined) {
                  setTotalSteps(totalStepsData);
                }
                if (masksRemainingData !== undefined) {
                  setMasksRemaining(masksRemainingData);
                }

                // Add to history for each step to track evolution
                if (diffusionStep !== undefined) {
                  setStepHistory((prev) => {
                    const newHistory = [...prev];
                    const existingIndex = newHistory.findIndex(
                      (h) => h.step === diffusionStep
                    );
                    const stepData = {
                      step: diffusionStep,
                      text: text || '',
                      masksRemaining: masksRemainingData || 0,
                    };
                    if (existingIndex >= 0) {
                      newHistory[existingIndex] = stepData;
                    } else {
                      newHistory.push(stepData);
                    }
                    return newHistory.sort((a, b) => a.step - b.step);
                  });
                }

                // Check for finish condition
                if (parsedData.finish_reason) {
                  setIsGenerating(false);
                  setTimeRemaining(null);
                }
              } catch (err) {
                console.error('Error parsing event data:', err);
              }
            }
          }
        }
      };

      processStream().catch((err) => {
        // Ignore abort errors as they're intentional
        if (err.name !== 'AbortError') {
          setError(`Stream processing error: ${err.message}`);
          setIsGenerating(false);
        }
      });
    } catch (err) {
      // Ignore abort errors as they're intentional
      if (err.name !== 'AbortError') {
        setError(`Failed to start generation: ${err.message}`);
        setIsGenerating(false);
      }
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    chatAPI.stopStreamingResponse();
    setIsGenerating(false);
  };

  const progressPercentage =
    totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      {/* Left sidebar with settings */}
      <ChatSettingsOnLeftHandSide
        generationParameters={generationParameters}
        setGenerationParameters={setGenerationParameters}
        defaultPromptConfigForModel={defaultPromptConfigForModel}
        conversations={conversations}
        conversationsIsLoading={conversationsIsLoading}
        conversationsMutate={conversationsMutate}
        setChats={setChats}
        setConversationId={setConversationId}
        conversationId={conversationId}
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
      />

      {/* Main content area */}
      <Sheet
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflow: 'hidden',
        }}
      >
        {/* Input area */}
        <Stack spacing={2}>
          <Textarea
            placeholder="Enter your prompt here..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            minRows={3}
            maxRows={6}
            disabled={isGenerating}
            sx={{ width: '100%' }}
          />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              startDecorator={
                isGenerating ? (
                  <CircularProgress size="sm" />
                ) : (
                  <SendIcon size={16} />
                )
              }
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
            {isGenerating && (
              <Button
                variant="outlined"
                color="danger"
                onClick={handleStopGeneration}
                startDecorator={<StopCircle size={16} />}
              >
                Stop
              </Button>
            )}
            {tokenCount?.tokenCount && (
              <Typography level="body-sm" sx={{ ml: 'auto' }}>
                Tokens: {tokenCount.tokenCount}
              </Typography>
            )}
          </Box>
        </Stack>

        {/* Error display */}
        {error && (
          <Alert color="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Header - matching terminal visualizer style */}
        {(isGenerating || totalSteps > 0) && (
          <Card
            variant="outlined"
            sx={{
              backgroundColor: 'primary.50',
              borderColor: 'primary.300',
              borderWidth: 2,
            }}
          >
            <Typography
              level="title-lg"
              sx={{
                textAlign: 'center',
                fontWeight: 'bold',
                color: 'primary.700',
              }}
            >
              dLLM Diffusion
            </Typography>
          </Card>
        )}

        {/* Progress and stats - matching terminal visualizer */}
        {(isGenerating || totalSteps > 0) && (
          <Card variant="outlined">
            <Stack spacing={2}>
              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'primary.600' }}>
                    Diffusion
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography level="body-sm">
                      {currentStep} / {totalSteps}
                    </Typography>
                    {masksRemaining !== undefined && (
                      <Typography level="body-sm" sx={{ color: 'primary.600' }}>
                        • Masks: {masksRemaining}
                      </Typography>
                    )}
                    <Typography level="body-sm" sx={{ color: 'primary.600' }}>
                      • {Math.round(progressPercentage)}%
                    </Typography>
                    {timeRemaining !== null && timeRemaining > 0 && (
                      <Typography level="body-sm" sx={{ color: 'neutral.500' }}>
                        • {Math.round(timeRemaining)}s remaining
                      </Typography>
                    )}
                  </Box>
                </Box>
                <LinearProgress
                  determinate
                  value={progressPercentage}
                  sx={{
                    width: '100%',
                    height: 8,
                    borderRadius: 'sm',
                  }}
                />
              </Box>
            </Stack>
          </Card>
        )}

        {/* Generated text display - matching terminal visualizer panel style */}
        <Card
          variant="outlined"
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            borderColor: 'primary.300',
            borderWidth: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1,
              pb: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography level="title-md" fontWeight="bold">
              Generated Text
            </Typography>
            {currentStep > 0 && totalSteps > 0 && (
              <Typography level="body-sm" color="neutral">
                Step {currentStep} / {totalSteps}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              flex: 1,
              p: 2,
              backgroundColor: 'background.surface',
              borderRadius: 'sm',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              minHeight: '200px',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {generatedText || (
              <Typography level="body-sm" color="neutral">
                Generated text will appear here as diffusion steps progress...
              </Typography>
            )}
          </Box>
        </Card>

        {/* Step history (optional, can be collapsed) */}
        {stepHistory.length > 0 && (
          <Card variant="outlined" sx={{ maxHeight: '200px', overflow: 'auto' }}>
            <Typography level="title-sm" sx={{ mb: 1 }}>
              Step History
            </Typography>
            <Stack spacing={1}>
              {stepHistory.map((stepData) => (
                <Box key={stepData.step}>
                  <Typography level="body-xs" color="neutral">
                    Step {stepData.step}
                    {stepData.masksRemaining !== undefined &&
                      ` • Masks: ${stepData.masksRemaining}`}
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '60px',
                      overflow: 'auto',
                    }}
                  >
                    {stepData.text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Card>
        )}
      </Sheet>
    </Sheet>
  );
}

