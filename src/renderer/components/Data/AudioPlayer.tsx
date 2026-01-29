import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  IconButton,
  Button,
} from '@mui/joy';
import { Play, Pause, Volume2, Download } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { fetchWithAuth } from 'renderer/lib/authContext';

interface AudioPlayerProps {
  audioData: {
    audio_data_url: string;
  };
  metadata?: {
    path?: string;
    duration?: number;
    /** Filename to use when downloading (e.g. with correct extension). Falls back to path + audioFormat if not set. */
    downloadFilename?: string;
    /** Audio format (e.g. "wav") used to build download filename when path has no extension. */
    audioFormat?: string;
  };
  transcription?: string;
  compact?: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioData,
  metadata,
  transcription,
  compact = false,
}) => {
  const [wavesurfer, setWavesurfer] = React.useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [duration, setDuration] = React.useState<number>(0);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [audioBlobUrl, setAudioBlobUrl] = React.useState<string | null>(null);
  const waveformRef = React.useRef<HTMLDivElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const nativeAudioRef = React.useRef<HTMLAudioElement>(null);
  const isDestroyedRef = React.useRef(false);

  // Compact mode handlers
  const handlePlayPauseCompact = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleError = () => {
    setError('Failed to load audio');
    setIsLoading(false);
  };

  // No longer need manual syncing handlers as WaveSurfer will use the native audio element

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Fetch audio data with authentication and create blob URL
  // This way we don't need to pass a URL that requires auth to audio element
  React.useEffect(() => {
    if (!audioData?.audio_data_url) {
      return undefined;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchAudio = async () => {
      try {
        const response = await fetchWithAuth(audioData.audio_data_url);

        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }

        // Check for unmounting before making blob URL
        if (isCancelled) return;

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Make sure this hasn't been unmounted before setting.
        // Avoids possible memory leak.
        if (isCancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        setAudioBlobUrl(blobUrl);
      } catch (err) {
        if (!isCancelled) {
          console.error('Error fetching audio:', err);
          setError('Failed to load audio');
          setIsLoading(false);
        }
      }
    };

    fetchAudio();

    return () => {
      isCancelled = true;
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, [audioData?.audio_data_url]);

  // Regular mode - WaveSurfer player effects
  React.useEffect(() => {
    // Skip if we're in compact mode or missing required refs/data
    if (
      compact ||
      !waveformRef.current ||
      !nativeAudioRef.current ||
      isDestroyedRef.current ||
      !audioBlobUrl
    ) {
      return undefined;
    }

    // Set initial states
    setIsLoading(true);
    setError(null);

    try {
      // Create a reference to the current audio element
      const audioElement = nativeAudioRef.current;

      // Create a WaveSurfer instance
      const ws = WaveSurfer.create({
        container: waveformRef.current,
        media: audioElement,
        waveColor: '#4f46e5',
        progressColor: '#7c3aed',
        cursorColor: 'var(--joy-palette-primary-400)',
        height: 60,
        normalize: true,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        fillParent: true,
      });

      // Set up event listeners
      ws.on('ready', () => setIsLoading(false));
      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('error', () => {
        setError('Failed to load audio');
        setIsLoading(false);
      });

      // Store the WaveSurfer instance in state
      setWavesurfer(ws);

      // Return cleanup function
      return () => {
        isDestroyedRef.current = true;
        try {
          ws.destroy();
        } catch (cleanupError) {
          // Ignore errors during cleanup
        }
        setWavesurfer(null);
        setIsPlaying(false);
        setIsLoading(true);
        setError(null);
      };
    } catch (initError) {
      setError('Failed to initialize audio player');
      setIsLoading(false);
      return undefined;
    }
  }, [compact, audioBlobUrl]);

  React.useEffect(() => {
    isDestroyedRef.current = false;
  }, [audioBlobUrl]);

  // Compact mode render
  if (compact) {
    return (
      <Box sx={{ minWidth: '200px', maxWidth: '300px' }}>
        <audio
          ref={audioRef}
          src={audioBlobUrl || undefined}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onError={handleError}
          preload="metadata"
        >
          <track kind="captions" />
        </audio>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <IconButton
            size="sm"
            variant="soft"
            onClick={handlePlayPauseCompact}
            disabled={isLoading || !!error}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </IconButton>

          <Volume2 size={12} />

          {isLoading && (
            <Typography level="body-sm" sx={{ fontSize: '0.7rem' }}>
              Loading...
            </Typography>
          )}

          {error && (
            <Typography
              level="body-sm"
              color="danger"
              sx={{ fontSize: '0.7rem' }}
            >
              Error
            </Typography>
          )}

          {!isLoading && !error && (
            <Typography level="body-sm" sx={{ fontSize: '0.7rem' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>
          )}
        </Box>

        {metadata?.path && (
          <Typography
            level="body-sm"
            sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 0.5 }}
          >
            <strong>File:</strong> {metadata.path.split('/').pop()}
          </Typography>
        )}

        {transcription && (
          <Typography
            level="body-sm"
            sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
          >
            <strong>Transcription:</strong> {transcription}
          </Typography>
        )}
      </Box>
    );
  }

  // Regular mode render
  return (
    <Card sx={{ minWidth: '300px' }}>
      <CardContent>
        <Stack spacing={2}>
          {/* Status Messages */}
          {isLoading && (
            <Typography level="body-sm" color="neutral">
              Loading...
            </Typography>
          )}
          {error && (
            <Typography level="body-sm" color="danger">
              {error}
            </Typography>
          )}

          {/* Waveform */}
          <Box
            ref={waveformRef}
            sx={{
              width: '100%',
              minHeight: '60px',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 'sm',
              padding: 1,
              opacity: isLoading ? 0.5 : 1,
            }}
          />

          {/* Native Audio Controls (download hidden; we provide a link with correct filename below) */}
          <audio
            ref={nativeAudioRef}
            src={audioBlobUrl || undefined}
            controls
            controlsList="nodownload"
            style={{ width: '100%' }}
          >
            <track kind="captions" />
          </audio>

          {/* Metadata and Download */}
          <Stack spacing={1}>
            {metadata?.path &&
              (() => {
                let downloadName = metadata.downloadFilename;
                if (downloadName == null) {
                  downloadName = metadata.path.includes('.')
                    ? metadata.path
                    : `${metadata.path}.${metadata.audioFormat || 'wav'}`;
                }
                const canDownload = Boolean(audioBlobUrl && downloadName);
                return (
                  <Box
                    sx={{
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong>File:</strong>{' '}
                    {canDownload ? (
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        sx={{ fontSize: '0.75rem', '--Button-gap': '0.25rem' }}
                        startDecorator={<Download size={12} />}
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = audioBlobUrl!;
                          a.download = downloadName;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                      >
                        {metadata.path}
                      </Button>
                    ) : (
                      metadata.path
                    )}
                  </Box>
                );
              })()}
            {metadata?.duration && (
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                <strong>Duration:</strong> {metadata.duration}s
              </Box>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default AudioPlayer;
