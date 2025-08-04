import React from 'react';
import {
  List,
  ListItem,
  Typography,
  Box,
  Chip,
  Sheet,
  IconButton,
} from '@mui/joy';
import { DownloadIcon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import AudioPlayer from '../../Data/AudioPlayer';

interface AudioHistoryItem {
  type: string;
  text: string;
  filename: string;
  model: string;
  speed: number;
  audio_format: string;
  sample_rate: number;
  temperature: number;
  audio_data_url?: string; // Add audio data URL for the AudioPlayer
}

interface AudioHistoryProps {
  audioHistory: AudioHistoryItem[];
  experimentId: string;
}

const AudioHistory: React.FC<AudioHistoryProps> = ({
  audioHistory,
  experimentId,
}) => {
  const handleDownloadAudio = (filename: string) => {
    const url = getAPIFullPath('conversations', ['downloadAudioFile'], {
      experimentId,
      filename,
    });
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!audioHistory || audioHistory.length === 0) {
    return (
      <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
        <Typography level="body-sm" color="neutral">
          No audio history available
        </Typography>
      </Sheet>
    );
  }

  return (
    <Sheet
      variant="plain"
      sx={{ borderRadius: 'md', overflowY: 'scroll', pr: 1 }}
    >
      <List sx={{ p: 0 }}>
        {audioHistory.map((item) => (
          <ListItem
            key={item.filename}
            variant="soft"
            sx={{
              flexDirection: 'column',
              alignItems: 'stretch',
              p: 2,
              mb: 2,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                mb: 2,
              }}
            >
              <Box sx={{ flex: 1, mr: 2 }}>
                <Typography
                  level="body-md"
                  sx={{ fontWeight: 'bold', mb: 0.5 }}
                >
                  &quot;{item.text}&quot;
                </Typography>
                {/* <Typography level="body-sm" color="neutral" sx={{ mb: 1 }}>
                  {item.filename}
                </Typography> */}
              </Box>

              <IconButton
                size="sm"
                variant="soft"
                color="neutral"
                onClick={() => handleDownloadAudio(item.filename)}
              >
                <DownloadIcon />
              </IconButton>
            </Box>

            {/* Audio Player */}
            {item.filename && (
              <Box sx={{ mb: 2 }}>
                <AudioPlayer
                  audioData={{
                    audio_data_url: getAPIFullPath(
                      'conversations',
                      ['downloadAudioFile'],
                      {
                        experimentId,
                        filename: item.filename,
                      },
                    ),
                  }}
                  metadata={{
                    path: item.filename,
                    duration: undefined, // Duration not available in history data
                  }}
                />
              </Box>
            )}

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip size="sm" variant="soft" color="primary">
                {item.model.split('/').pop()}
              </Chip>
              <Chip size="sm" variant="soft" color="neutral">
                {item.audio_format.toUpperCase()}
              </Chip>
              <Chip size="sm" variant="soft" color="neutral">
                {item.sample_rate / 1000}kHz
              </Chip>
              <Chip size="sm" variant="soft" color="neutral">
                Speed: {item.speed}x
              </Chip>
              <Chip size="sm" variant="soft" color="neutral">
                Temp: {item.temperature}
              </Chip>
            </Box>
          </ListItem>
        ))}
      </List>
    </Sheet>
  );
};

export default AudioHistory;
