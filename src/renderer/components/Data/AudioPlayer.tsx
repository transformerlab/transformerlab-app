import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  IconButton,
} from '@mui/joy';
import { Play, Pause, Volume2 } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';

interface AudioPlayerProps {
  audioData: {
    audio_data_url: string;
  };
  metadata?: {
    path?: string;
    duration?: number;
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
  const waveformRef = React.useRef<HTMLDivElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Regular mode - WaveSurfer player effects
  React.useEffect(() => {
    if (
      !compact &&
      waveformRef.current &&
      !wavesurfer &&
      !isDestroyedRef.current &&
      audioData?.audio_data_url
    ) {
      setIsLoading(true);
      setError(null);

      try {
        const ws = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: '#4f46e5',
          progressColor: '#7c3aed',
          cursorColor: 'var(--joy-palette-primary-400)',
          height: 60,
          normalize: true,
          barWidth: 3,
          barGap: 2,
          barRadius: 3,
          fillParent: true,
          mediaControls: false,
        });

        ws.on('ready', () => {
          setIsLoading(false);
        });

        ws.on('play', () => {
          setIsPlaying(true);
        });

        ws.on('pause', () => {
          setIsPlaying(false);
        });

        ws.on('error', () => {
          setError('Failed to load audio');
          setIsLoading(false);
        });

        ws.load(audioData.audio_data_url);
        setWavesurfer(ws);

        return () => {
          isDestroyedRef.current = true;
          if (ws) {
            try {
              ws.pause();
              ws.destroy();
            } catch (cleanupError) {
              // Ignore errors during cleanup
            }
          }
          setWavesurfer(null);
          setIsPlaying(false);
          setIsLoading(true);
          setError(null);
        };
      } catch (initError) {
        setError('Failed to initialize audio player');
        setIsLoading(false);
      }
    }

    return undefined;
  }, [compact, audioData?.audio_data_url]);

  React.useEffect(() => {
    isDestroyedRef.current = false;
  }, [audioData?.audio_data_url]);

  // Regular mode handlers
  const handlePlayPauseRegular = () => {
    if (wavesurfer) {
      if (isPlaying) {
        wavesurfer.pause();
      } else {
        wavesurfer.play();
      }
    }
  };

  // Compact mode render
  if (compact) {
    return (
      <Box sx={{ minWidth: '200px', maxWidth: '300px' }}>
        <audio
          ref={audioRef}
          src={audioData.audio_data_url}
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
          {/* Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="sm"
              variant="soft"
              onClick={handlePlayPauseRegular}
              disabled={!wavesurfer || isLoading || !!error}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </IconButton>
            <Volume2 size={16} />
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
          </Box>

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

          {/* Metadata */}
          <Stack spacing={1}>
            {metadata?.path && (
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                <strong>File:</strong> {metadata.path}
              </Box>
            )}
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
