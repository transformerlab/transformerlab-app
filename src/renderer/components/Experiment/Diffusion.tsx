import { useState, useEffect } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
  Textarea,
  Box,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Card,
  CardContent,
  Grid,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  CircularProgress,
} from '@mui/joy';
import { Trash2Icon, DownloadIcon, DeleteIcon } from 'lucide-react';
import { Endpoints } from 'renderer/lib/api-client/endpoints';

type HistoryImage = {
  id: string;
  prompt: string;
  image_base64: string;
  timestamp: string;
  metadata: {
    prompt: string;
    num_inference_steps: number;
    guidance_scale: number;
    seed: number;
  };
};

type HistoryData = {
  images: HistoryImage[];
  total: number;
};

type DiffusionProps = {
  experimentInfo?: any;
};

export default function Diffusion({ experimentInfo }: DiffusionProps = {}) {
  const initialModel =
    experimentInfo?.config?.foundation || 'stabilityai/stable-diffusion-2-1';
  const adaptor = experimentInfo?.config?.adaptor || '';
  const [model] = useState(initialModel);
  const [prompt, setPrompt] = useState(
    'A fantasy landscape, trending on artstation',
  );
  const [numSteps, setNumSteps] = useState(30);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStableDiffusion, setIsStableDiffusion] = useState<boolean | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState('generate');

  // History state
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HistoryImage | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setImageBase64('');
    try {
      const response = await fetch(Endpoints.Diffusion.Generate(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          adaptor,
          prompt,
          num_inference_steps: Number(numSteps),
          guidance_scale: Number(guidanceScale),
          seed: seed ? Number(seed) : 42,
        }),
      });
      const data = await response.json();
      if (data.error_code !== 0) {
        setError('Error generating image');
      } else {
        setImageBase64(data.image_base64);
      }
    } catch (e) {
      setError('Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImage = () => {
    if (!imageBase64) return;

    // Convert base64 to blob
    const byteCharacters = atob(imageBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Generate filename with timestamp and truncated prompt
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    link.download = `diffusion_${timestamp}.png`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Check if model is eligible for diffusion
  const checkStableDiffusion = async () => {
    setIsStableDiffusion(null);
    try {
      const response = await fetch(Endpoints.Diffusion.CheckStableDiffusion(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await response.json();
      setIsStableDiffusion(data.is_stable_diffusion);
    } catch (e) {
      setIsStableDiffusion(false);
    }
  };

  // Load history
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(Endpoints.Diffusion.GetHistory());
      const data = await response.json();
      setHistoryData(data);
      console.log('History loaded:', data);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // View image in modal
  const viewImage = async (imageId: string) => {
    try {
      const response = await fetch(Endpoints.Diffusion.GetImageById(imageId));
      const data = await response.json();
      setSelectedImage(data);
      setImageModalOpen(true);
    } catch (e) {
      console.error('Failed to load image:', e);
    }
  };

  // Delete single image
  const deleteImage = async (imageId: string) => {
    try {
      await fetch(Endpoints.Diffusion.DeleteImage(imageId), {
        method: 'DELETE',
      });
      await loadHistory(); // Reload history
      setDeleteConfirmOpen(false);
      setImageToDelete(null);
    } catch (e) {
      console.error('Failed to delete image:', e);
    }
  };

  // Clear all history
  const clearAllHistory = async () => {
    try {
      await fetch(Endpoints.Diffusion.ClearHistory(), {
        method: 'DELETE',
      });
      await loadHistory(); // Reload history
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  // Download image from history
  const downloadHistoryImage = (imageData: HistoryImage) => {
    if (!imageData.image_base64) return;

    // Convert base64 to blob
    const byteCharacters = atob(imageData.image_base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diffusion_${imageData.id}.png`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Check on mount and when model changes
  useEffect(() => {
    checkStableDiffusion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Load history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <Typography level="h2" mb={2}>
        Diffusion Image Generation
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(event, newValue) => setActiveTab(newValue as string)}
      >
        <TabList>
          <Tab value="generate">Generate</Tab>
          <Tab value="history">History</Tab>
        </TabList>

        <TabPanel value="generate" sx={{ p: 0, height: 'calc(100vh - 200px)' }}>
          <Stack
            flexDirection="row"
            display="flex"
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
            gap={2}
          >
            <Stack
              gap={2}
              flex={1}
              flexDirection="column"
              sx={{
                height: '100%',
                overflowX: 'hidden',
                overflowY: 'auto',
              }}
            >
              <FormControl>
                <FormLabel>Model</FormLabel>
                <Input
                  value={model}
                  disabled
                  readOnly
                  placeholder="Model name or path"
                />
              </FormControl>
              {adaptor && (
                <FormControl>
                  <FormLabel>Adaptor</FormLabel>
                  <Input
                    value={adaptor}
                    disabled
                    readOnly
                    placeholder="Adaptor name or path"
                  />
                </FormControl>
              )}
              <FormControl>
                <FormLabel>Prompt</FormLabel>
                <Textarea
                  minRows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate"
                />
              </FormControl>
              <Stack
                gap={1}
                sx={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                }}
              >
                <FormControl sx={{ flex: 1, display: 'flex' }}>
                  <FormLabel>Steps</FormLabel>
                  <Input
                    type="number"
                    value={numSteps}
                    sx={{ width: 100 }}
                    onChange={(e) => setNumSteps(Number(e.target.value))}
                  />
                </FormControl>
                <FormControl
                  sx={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <FormLabel>Guidance Scale</FormLabel>
                  <Input
                    type="number"
                    value={guidanceScale}
                    sx={{ width: 100 }}
                    onChange={(e) => setGuidanceScale(Number(e.target.value))}
                  />
                </FormControl>
                <FormControl
                  sx={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <FormLabel>Seed (optional)</FormLabel>
                  <Input
                    type="number"
                    value={seed}
                    sx={{ width: 100 }}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </FormControl>
              </Stack>
              <Button
                onClick={handleGenerate}
                loading={loading}
                disabled={loading || isStableDiffusion === false}
                color="primary"
                size="lg"
              >
                Generate Image
              </Button>
            </Stack>
            <Box
              flex={2}
              sx={{
                overflow: 'hidden',
                display: 'flex',
                paddingBottom: 1,
                paddingRight: 1,
              }}
            >
              {error && <Typography color="danger">{error}</Typography>}
              {isStableDiffusion === false && (
                <Typography color="danger">
                  This model is not eligible for diffusion.
                </Typography>
              )}
              {imageBase64 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <img
                    src={`data:image/png;base64,${imageBase64}`}
                    alt="Generated"
                    style={{
                      borderRadius: 8,
                      maxWidth: '100%',
                      maxHeight: 'calc(100% - 60px)',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <Button
                    onClick={handleSaveImage}
                    color="neutral"
                    variant="outlined"
                    size="sm"
                  >
                    Save Image
                  </Button>
                </Box>
              )}
            </Box>
          </Stack>
        </TabPanel>

        <TabPanel value="history" sx={{ p: 0, height: 'calc(100vh - 200px)' }}>
          <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography level="h3">Generation History</Typography>
              <Button
                onClick={clearAllHistory}
                color="danger"
                variant="outlined"
                size="sm"
                startDecorator={<Trash2Icon size="16px" />}
                disabled={!historyData?.images?.length}
              >
                Clear All
              </Button>
            </Box>

            {historyLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
              </Box>
            )}

            {historyData && !historyLoading && (
              <>
                {historyData.images && historyData.images.length > 0 ? (
                  <Grid container spacing={2}>
                    {historyData.images.map((item: any) => (
                      <Grid key={item.id} xs={12} sm={6} md={4} lg={3}>
                        <Card
                          sx={{
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            border: '1px solid var(--joy-palette-divider)',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: 'lg',
                            },
                          }}
                          onClick={() => viewImage(item.id)}
                        >
                          <CardContent sx={{ p: 1.5 }}>
                            <Typography
                              level="body-sm"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                mb: 1,
                                minHeight: '2.5em',
                              }}
                            >
                              {item.prompt}
                            </Typography>
                            <Typography
                              level="body-xs"
                              sx={{ color: 'text.tertiary' }}
                            >
                              {item.timestamp
                                ? new Date(item.timestamp).toLocaleDateString()
                                : 'Unknown date'}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Box sx={{ textAlign: 'center', mt: 4 }}>
                    <Typography>No images generated yet</Typography>
                  </Box>
                )}
              </>
            )}
          </Box>
        </TabPanel>
      </Tabs>

      {/* Image View Modal */}
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog
          size="lg"
          sx={{
            p: 3,
            maxWidth: '95vw',
            maxHeight: '95vh',
            border: '2px solid var(--joy-palette-neutral-300)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <ModalClose />
          {selectedImage && (
            <>
              <DialogTitle sx={{ pb: 2 }}>Generated Image</DialogTitle>
              <DialogContent sx={{ p: 0 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box
                    sx={{
                      border: '1px solid var(--joy-palette-neutral-200)',
                      borderRadius: '8px',
                      p: 1,
                      mb: 3,
                      backgroundColor: 'var(--joy-palette-background-body)',
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${selectedImage.image_base64}`}
                      alt="Generated"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '65vh',
                        objectFit: 'contain',
                        borderRadius: '6px',
                        display: 'block',
                        margin: '0 auto',
                      }}
                    />
                  </Box>
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography level="title-md" sx={{ mb: 1 }}>
                      Prompt:
                    </Typography>
                    <Typography
                      sx={{
                        mb: 2,
                        p: 2,
                        backgroundColor: 'var(--joy-palette-background-level1)',
                        borderRadius: '6px',
                      }}
                    >
                      {selectedImage.metadata.prompt}
                    </Typography>

                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Parameters:
                    </Typography>
                    <Typography
                      level="body-sm"
                      sx={{
                        mb: 3,
                        p: 2,
                        backgroundColor: 'var(--joy-palette-background-level1)',
                        borderRadius: '6px',
                      }}
                    >
                      Steps: {selectedImage.metadata.num_inference_steps} |
                      Guidance: {selectedImage.metadata.guidance_scale} | Seed:{' '}
                      {selectedImage.metadata.seed}
                    </Typography>

                    <Box
                      sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}
                    >
                      <Button
                        onClick={() => downloadHistoryImage(selectedImage)}
                        startDecorator={<DownloadIcon size="16px" />}
                        variant="solid"
                        color="primary"
                      >
                        Download
                      </Button>
                      <Button
                        color="danger"
                        variant="outlined"
                        onClick={() => {
                          setImageToDelete(selectedImage.id);
                          setDeleteConfirmOpen(true);
                          setImageModalOpen(false);
                        }}
                        startDecorator={<DeleteIcon size="16px" />}
                      >
                        Delete
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </DialogContent>
            </>
          )}
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <ModalDialog size="sm">
          <ModalClose />
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete this image? This action cannot be
              undone.
            </Typography>
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                gap: 1,
                justifyContent: 'flex-end',
              }}
            >
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onClick={() => imageToDelete && deleteImage(imageToDelete)}
              >
                Delete
              </Button>
            </Box>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
