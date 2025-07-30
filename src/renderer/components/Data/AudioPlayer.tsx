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

interface AudioPlayerProps {
  audioData: {
    audio_data_url: string;
  };
  metadata: {
    path?: string;
    sampling_rate?: number;
    duration?: number;
    samples?: number;
    format?: string;
  };
  transcription?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioData, metadata }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audio] = React.useState(new Audio(audioData.audio_data_url));

  const togglePlay = () => {
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  // Handle audio ended event
  React.useEffect(() => {
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [audio]);

  return (
    <Card variant="outlined" sx={{ maxWidth: 400 }}>
      <CardContent>
        <Stack spacing={2}>
          {/* Audio Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="sm"
              variant="solid"
              color="primary"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </IconButton>
            <Volume2 size={16} />
            <Typography level="body-sm">
              {metadata?.duration
                ? `${metadata.duration.toFixed(1)}s`
                : 'Audio'}
            </Typography>
          </Box>

          {/* File Path Only */}
          {metadata?.path && (
            <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              <div>
                <strong>File:</strong> {metadata.path}
              </div>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default AudioPlayer;
