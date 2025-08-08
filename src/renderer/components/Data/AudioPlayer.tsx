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
  metadata: {
    path?: string;
    duration?: number;
  };
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioData, metadata }) => {
  const [wavesurfer, setWavesurfer] = React.useState<WaveSurfer | null>(null);
  const waveformRef = React.useRef<HTMLDivElement>(null);
  const isDestroyedRef = React.useRef(false);

  // Initialize Wavesurfer
  React.useEffect(() => {
    if (waveformRef.current && !wavesurfer && !isDestroyedRef.current) {
      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4f46e5',
        // progressColor: '#7c3aed',
        cursorColor: 'var(--joy-palette-primary-400)',
        height: 60,
        normalize: true,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        fillParent: true,
        pixelRatio: 1,
        mediaControls: true,
      });

      ws.load(audioData.audio_data_url);

      setWavesurfer(ws);

      return () => {
        isDestroyedRef.current = true;
        if (ws && !ws.isDestroyed) {
          try {
            ws.pause();
            ws.destroy();
          } catch (error) {
            // Ignore errors during cleanup
            console.warn('Error destroying wavesurfer:', error);
          }
        }
        setWavesurfer(null);
      };
    }
  }, [audioData.audio_data_url]);

  // Reset destroyed flag when audio URL changes
  React.useEffect(() => {
    isDestroyedRef.current = false;
  }, [audioData.audio_data_url]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
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
            }}
          />

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
