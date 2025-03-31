import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Sheet,
  Stack,
  Textarea,
  Typography,
  Slider,
  Tooltip,
} from '@mui/joy';
import { SendIcon, StopCircle, ChevronLeft, ChevronRight, ConstructionIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';

export default function VisualizeGeneration({
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
  const [isPaused, setIsPaused] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [currentTokenId, setCurrentTokenId] = useState(null);
  const [mlpActivations, setMlpActivations] = useState([]);
  const [attentionEntropy, setAttentionEntropy] = useState([]);
  const [topPredictions, setTopPredictions] = useState([]);
  const [error, setError] = useState(null);

  // History tracking
  const [tokenHistory, setTokenHistory] = useState([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);

  const abortControllerRef = useRef(null);


  // Clean up fetch when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const processTokenData = (tokenData) => {
    if (!tokenData) return;

    // Add to history
    setTokenHistory(prev => [...prev, tokenData]);

    // Display this token's data
    const {
      text,
      token_id,
      mlp_activations,
      attention_entropy,
      top_predictions,
      finish_reason
    } = tokenData;

    setGeneratedText(text || '');
    setCurrentTokenId(token_id);

    // Process mlp_activations
    const flattenedActivations = mlp_activations ?
      mlp_activations.map(innerArray => {
        let value = Array.isArray(innerArray) && innerArray.length > 0
          ? innerArray[0]
          : innerArray;

        return isNaN(Number(value)) ? 0 : Number(value);
      }) : [];
    setMlpActivations(flattenedActivations);

    // Process attention_entropy
    const processedEntropy = attention_entropy ?
      attention_entropy.map(value => isNaN(Number(value)) ? 0 : Number(value)) : [];
    setAttentionEntropy(processedEntropy);

    setTopPredictions(top_predictions || []);
    setCurrentHistoryIndex(prev => prev + 1);

    if (finish_reason) {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setIsPaused(false);
    setError(null);
    setGeneratedText('');
    setMlpActivations([]);
    setAttentionEntropy([]);
    setTopPredictions([]);
    setTokenHistory([]);
    setCurrentHistoryIndex(-1);


    // Abort any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const model = experimentInfo?.config?.foundation;
      const url = `${chatAPI.API_URL()}v1/visualize_generation`;

      const params = {
        model: model,
        prompt: prompt,
        max_tokens: generationParameters?.maxTokens || 100,
        temperature: generationParameters?.temperature || 0.7,
        top_p: generationParameters?.topP || 1.0,
        stream: true
      };

      // Make fetch request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }

      // Get a reader from the response body
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
          const lines = buffer.split('\n\n');
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

                // Add to processing queue instead of immediate processing
                processTokenData(parsedData);

              } catch (err) {
                console.error("Error parsing event data:", err);
              }
            }
          }
        }
      };

      processStream().catch(err => {
        // Ignore abort errors as they're intentional
        if (err.name !== 'AbortError') {
          setError(`Stream processing error: ${err.message}`);
          setIsGenerating(false);
        }
      });

    } catch (err) {
      // Ignore abort errors as they're intentional
      if (err.name !== 'AbortError') {
        setError(`Failed to start visualization: ${err.message}`);
        setIsGenerating(false);
      }
    }
  };

  const handleStopGeneration = () => {
    // Abort the current fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null; // Clear the reference
    }

    // Call the parent component's stopStreaming function
    if (typeof stopStreaming === 'function') {
      stopStreaming();
    }

    // Update all relevant state
    setIsGenerating(false);
    setIsPaused(false);

  };

  const navigateHistory = (direction) => {
    if (direction === 'prev' && currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      displayHistoryItem(tokenHistory[newIndex]);
    } else if (direction === 'next' && currentHistoryIndex < tokenHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      displayHistoryItem(tokenHistory[newIndex]);
    }
  };

  const displayHistoryItem = (item) => {
    if (!item) return;

    setGeneratedText(item.text || '');
    setCurrentTokenId(item.token_id);

    // Process mlp_activations
    const flattenedActivations = item.mlp_activations ?
      item.mlp_activations.map(innerArray => {
        let value = Array.isArray(innerArray) && innerArray.length > 0
          ? innerArray[0]
          : innerArray;

        return isNaN(Number(value)) ? 0 : Number(value);
      }) : [];
    setMlpActivations(flattenedActivations);

    // Process attention_entropy
    const processedEntropy = item.attention_entropy ?
      item.attention_entropy.map(value => isNaN(Number(value)) ? 0 : Number(value)) : [];
    setAttentionEntropy(processedEntropy);

    setTopPredictions(item.top_predictions || []);
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
    >
      <ChatSettingsOnLeftHandSide
        generationParameters={generationParameters}
        setGenerationParameters={setGenerationParameters}
        tokenCount={tokenCount}
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

<Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          overflow: 'hidden',
        }}
      >
      <Alert
           color="neutral"
           variant="outlined"
           startDecorator={<ConstructionIcon />}
         >
           This feature is currently in developement. It only works with Fastchat and MLX Server currently.
         </Alert>
        <Typography level="h2" sx={{ mb: 2, px: 2, pt: 2 }}>
          Model Activations
        </Typography>

        {error && (
          <Alert color="danger" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ p: 2 }}>
          <Textarea
            placeholder="Enter a prompt to visualize model activations..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            minRows={3}
            sx={{ mb: 1 }}
          />

        <Stack direction="row" justifyContent="space-between" spacing={1}>
          {/* History navigation controls */}
          {tokenHistory.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                color="neutral"
                disabled={currentHistoryIndex <= 0}
                onClick={() => navigateHistory('prev')}
              >
                <ChevronLeft />
              </IconButton>
              <Typography sx={{ alignSelf: 'center' }}>
                {currentHistoryIndex + 1} / {tokenHistory.length}
              </Typography>
              <IconButton
                color="neutral"
                disabled={currentHistoryIndex >= tokenHistory.length - 1}
                onClick={() => navigateHistory('next')}
              >
                <ChevronRight />
              </IconButton>

            </Box>
          )}

          <Stack direction="row" spacing={1}>
          {isGenerating && (
              <IconButton
                color="danger"
                onClick={handleStopGeneration}
                aria-label="Stop generation"
              >
                <StopCircle />
              </IconButton>
            )}


            <Button
              color="neutral"
              disabled={isGenerating || !prompt.trim()}
              endDecorator={isGenerating ? (
                <CircularProgress thickness={2} size="sm" color="neutral" />
              ) : (
                <SendIcon size="20px" />
              )}
              onClick={handleGenerate}
            >
              {isGenerating ? "Generating..." : "Visualize"}
            </Button>
          </Stack>
        </Stack>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            overflow: 'auto',
            p: 2,
            pt: 0,
            gap: 2,
          }}
        >
          {generatedText && (
            <Box sx={{ mb: 2 }}>
              <Typography level="title-md">Generated Text</Typography>
              <Sheet
                variant="outlined"
                sx={{ p: 2, mt: 1, whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto' }}
              >
                {generatedText}
              </Sheet>
            </Box>
          )}

          {topPredictions.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography level="title-md">Token Predictions</Typography>
              <Sheet variant="outlined" sx={{ p: 2, mt: 1, overflow: 'auto' }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {topPredictions.map((prediction, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1,
                        border: '1px solid',
                        borderColor: idx === 0 ? 'success.500' : 'neutral.300',
                        borderRadius: 'sm',
                        bgcolor: idx === 0 ? 'success.100' : 'neutral.50',
                      }}
                    >
                      <Typography color={idx === 0 ? 'success' : 'neutral'} fontWeight={idx === 0 ? 'bold' : 'normal'}>
                        {prediction.token} ({(prediction.prob * 100).toFixed(1)}%, {prediction.logit.toFixed(2)})
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Sheet>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
            {mlpActivations.length > 0 && (
              <Box sx={{ flex: 1 }}>
                <Typography level="title-md">MLP Activations</Typography>
                <Sheet variant="outlined" sx={{ p: 2, mt: 1, height: '300px', overflow: 'auto' }}>
                  {mlpActivations.map((value, idx) => {
                    const absValue = Math.abs(value);
                    const maxValue = Math.max(...mlpActivations.map(v => Math.abs(v)));
                    const barWidth = (absValue / maxValue) * 100;
                    const isPositive = value >= 0;

                    return (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography level="body-sm" sx={{ width: '60px' }}>
                          Layer {idx}
                        </Typography>
                        <Box sx={{
                          width: `${barWidth}%`,
                          height: '12px',
                          maxWidth: 'calc(100% - 120px)',
                          bgcolor: isPositive ? 'success.300' : 'warning.300',
                          borderRadius: 'sm'
                        }} />
                        <Typography level="body-sm" sx={{ ml: 1, width: '60px' }}>
                          {value.toFixed(3)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Sheet>
              </Box>
            )}

            {attentionEntropy.length > 0 && (
              <Box sx={{ flex: 1 }}>
                <Typography level="title-md">Attention Entropy</Typography>
                <Sheet variant="outlined" sx={{ p: 2, mt: 1, height: '300px', overflow: 'auto' }}>
                  {attentionEntropy.map((value, idx) => {
                    const maxValue = Math.max(...attentionEntropy);
                    const barWidth = (value / maxValue) * 100;

                    return (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography level="body-sm" sx={{ width: '60px' }}>
                          Layer {idx}
                        </Typography>
                        <Box sx={{
                          width: `${barWidth}%`,
                          height: '12px',
                          maxWidth: 'calc(100% - 120px)',
                          bgcolor: 'primary.300',
                          borderRadius: 'sm'
                        }} />
                        <Typography level="body-sm" sx={{ ml: 1, width: '60px' }}>
                          {value.toFixed(3)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Sheet>
              </Box>
            )}
          </Box>
        </Box>
      </Sheet>
    </Sheet>
  );
}
