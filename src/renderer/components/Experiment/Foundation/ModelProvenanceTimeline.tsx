import { useState } from 'react';
import {
  Box,
  Card,
  Typography,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TabList,
  Tabs,
  Tab,
  TabPanel,
} from '@mui/joy';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function ModelProvenanceTimeline({ provenance }) {
  const [expandedStep, setExpandedStep] = useState(null);

  if (!provenance || !provenance.provenance_chain) {
    return <Typography>No provenance data available</Typography>;
  }

  return (
    <Box sx={{ width: '100%' }}>
      {provenance.provenance_chain.map((step, index) => (
        <Box key={step.job_id} sx={{ mb: 3 }}>
          {/* Timeline connector */}
          {index > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: '24px',
                ml: 4,
                mb: 1,
              }}
            >
              <Box
                sx={{ width: '2px', height: '100%', bgcolor: 'neutral.300' }}
              />
            </Box>
          )}

          {/* Step card */}
          <Card
            variant="outlined"
            sx={{
              transition: 'all 0.2s',
              '&:hover': { boxShadow: 'md' },
            }}
          >
            <Box sx={{ p: 2 }}>
              {/* Header with job info */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 2,
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ChevronRight size={18} />
                  <Typography level="title-lg">{step.output_model}</Typography>
                </Box>
                <Chip size="sm" variant="soft">
                  {step.job_id}
                </Chip>
              </Box>

              {/* Key model info */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Box>
                  <Typography level="body-sm" color="neutral">
                    Base Model
                  </Typography>
                  <Chip variant="soft" color="primary">
                    {step.input_model}
                  </Chip>
                </Box>

                <Box>
                  <Typography level="body-sm" color="neutral">
                    Training Dataset
                  </Typography>
                  <Chip variant="soft" color="success">
                    {step.dataset}
                  </Chip>
                </Box>

                {/* Key parameters summary */}
                <Box>
                  <Typography level="body-sm" color="neutral">
                    Key Parameters
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {extractKeyParams(step.parameters).map(([key, value]) => (
                      <Chip key={key} size="sm" variant="plain">
                        {key}: {value.toString()}
                      </Chip>
                    ))}
                  </Box>
                </Box>
              </Box>

              {/* Evaluation summary */}
              {step.evals && step.evals.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography level="body-sm" color="neutral">
                    Evaluation Metrics
                  </Typography>
                  <Box
                    sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}
                  >
                    {extractMetrics(step.evals).map((metric, i) => (
                      <Chip
                        key={i}
                        size="sm"
                        color={getMetricColor(metric.score)}
                        variant="soft"
                      >
                        {metric.type}: {formatScore(metric.score)}
                      </Chip>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>

            {/* Detailed info accordion */}
            <Accordion
              expanded={expandedStep === step.job_id}
              onChange={() =>
                setExpandedStep(
                  expandedStep === step.job_id ? null : step.job_id,
                )
              }
            >
              <AccordionSummary>
                <Typography level="body-sm">
                  {expandedStep === step.job_id
                    ? 'Hide details'
                    : 'Show details'}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Tabs defaultValue="params">
                  <TabList>
                    <Tab value="params">Training Parameters</Tab>
                    <Tab value="evals">Evaluation Details</Tab>
                  </TabList>

                  <TabPanel value="params">
                    <Box sx={{ maxHeight: '300px', overflow: 'auto' }}>
                      <Box
                        component="pre"
                        sx={{
                          fontSize: '0.75rem',
                          p: 2,
                          bgcolor: 'background.level1',
                          borderRadius: '4px',
                        }}
                      >
                        {JSON.stringify(step.parameters, null, 2)}
                      </Box>
                    </Box>
                  </TabPanel>

                  <TabPanel value="evals">
                    {step.evals && step.evals.length > 0 ? (
                      <Box sx={{ maxHeight: '300px', overflow: 'auto' }}>
                        {step.evals.map((evalItem) => (
                          <Card
                            key={evalItem.job_id}
                            variant="outlined"
                            sx={{ mb: 2, p: 2 }}
                          >
                            <Typography level="title-sm">
                              {evalItem.template_name ||
                                evalItem.evaluator ||
                                'Evaluation'}{' '}
                              ({evalItem.job_id})
                            </Typography>
                            <Divider sx={{ my: 1 }} />

                            {evalItem.scores ? (
                              <Box>
                                {(() => {
                                  try {
                                    const scoresArray = JSON.parse(
                                      evalItem.scores,
                                    );
                                    return Array.isArray(scoresArray) ? (
                                      scoresArray.map((scoreObj, idx) => (
                                        <Box
                                          key={idx}
                                          sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            mb: 0.5,
                                          }}
                                        >
                                          <Typography level="body-sm">
                                            {scoreObj.type || 'Metric'}:
                                          </Typography>
                                          <Typography
                                            level="body-sm"
                                            fontWeight="bold"
                                          >
                                            {formatScore(scoreObj.score)}
                                          </Typography>
                                        </Box>
                                      ))
                                    ) : (
                                      <Typography level="body-sm">
                                        Invalid score format
                                      </Typography>
                                    );
                                  } catch (error) {
                                    return (
                                      <Typography level="body-sm">
                                        Error parsing scores
                                      </Typography>
                                    );
                                  }
                                })()}
                              </Box>
                            ) : (
                              <Box
                                component="pre"
                                sx={{
                                  fontSize: '0.75rem',
                                  mt: 1,
                                  p: 1,
                                  bgcolor: 'background.level1',
                                  borderRadius: '4px',
                                }}
                              >
                                {JSON.stringify(evalItem, null, 2)}
                              </Box>
                            )}
                          </Card>
                        ))}
                      </Box>
                    ) : (
                      <Typography>No evaluation data available</Typography>
                    )}
                  </TabPanel>
                </Tabs>
              </AccordionDetails>
            </Accordion>
          </Card>
        </Box>
      ))}
    </Box>
  );
}

// Extract the most important parameters to show in the summary view
function extractKeyParams(params) {
  if (!params) return [];

  const importantKeys = [
    'learning_rate',
    'epochs',
    'batch_size',
    'max_steps',
    'lora_rank',
    'lora_alpha',
    'lora_dropout',
    'type',
  ];

  return Object.entries(params)
    .filter(([key]) => importantKeys.includes(key))
    .slice(0, 7); // Show maximum 3 key parameters
}

// Extract metrics from evaluations with the current data structure
function extractMetrics(evals) {
  const metrics = [];

  if (!evals) return metrics;

  evals.forEach((evalItem) => {
    if (evalItem.score) {
      try {
        // Parse the stringified JSON array
        const scoresArray = JSON.parse(evalItem.score);

        // Check if it's an array and process each item
        if (Array.isArray(scoresArray)) {
          scoresArray.forEach((scoreObj) => {
            if (scoreObj && scoreObj.type && scoreObj.score !== undefined) {
              metrics.push({
                type: scoreObj.type,
                score: scoreObj.score,
              });
            }
          });
        }
      } catch (error) {
        console.error('Error parsing scores:', error);
      }
    }
  });

  // Return top 3 metrics or fewer if not available
  return metrics.slice(0, 3);
}

// Format score to be readable
function formatScore(score) {
  if (score === undefined || score === null) return 'N/A';
  return typeof score === 'number' ? score.toFixed(4) : score.toString();
}

// Get color based on score value (assuming higher is better)
function getMetricColor(score) {
  if (typeof score !== 'number') return 'neutral';

  if (score > 0.8) return 'success';
  if (score > 0.5) return 'primary';
  return 'warning';
}
