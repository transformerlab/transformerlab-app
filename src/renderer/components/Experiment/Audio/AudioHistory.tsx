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
import { Trash2Icon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import AudioPlayer from '../../Data/AudioPlayer';
import { fetchWithAuth } from 'renderer/lib/authContext';

interface AudioHistoryItem {
  id: string;
  type: string;
  text: string;
  filename: string;
  model: string;
  adaptor?: string; // Add adaptor property
  speed: number;
  audio_format: string;
  sample_rate: number;
  temperature: number;
  top_p?: number;
  voice?: string;
  audio_data_url?: string; // Add audio data URL for the AudioPlayer
}

interface AudioHistoryProps {
  audioHistory: AudioHistoryItem[] | null | undefined;
  experimentId: string;
  mutateHistory: () => void;
}

const AudioHistory = React.forwardRef<HTMLDivElement, AudioHistoryProps>(
  ({ audioHistory, experimentId, mutateHistory }, ref) => {
    return (
      <Sheet
        ref={ref}
        variant="plain"
        sx={{ borderRadius: 'md', overflowY: 'auto', pr: 1 }}
      >
        <List sx={{ p: 0 }}>
          {Array.isArray(audioHistory) && audioHistory.length > 0 ? (
            audioHistory.map((item) => (
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
                  }}
                >
                  <Box sx={{ flex: 1, mr: 2 }}>
                    <Typography level="body-md" sx={{ mb: 0.5 }}>
                      &quot;
                      {item.text.length > 300
                        ? `${item.text.slice(0, 300)}…`
                        : item.text}
                      &quot;
                    </Typography>
                    {/* <Typography level="body-sm" color="neutral" sx={{ mb: 1 }}>
                  {item.filename}
                </Typography> */}
                  </Box>
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
                        downloadFilename: item.filename.includes('.')
                          ? item.filename
                          : `${item.filename}.${item.audio_format}`,
                        audioFormat: item.audio_format,
                      }}
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip size="sm" variant="soft" color="primary">
                    {item.model.split('/').pop()}
                    {item.adaptor && item.adaptor.trim() !== '' && (
                      <> + {item.adaptor.split('/').pop()}</>
                    )}
                  </Chip>
                  {item.voice && (
                    <Chip size="sm" variant="soft" color="neutral">
                      Voice: {item.voice}
                    </Chip>
                  )}
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
                  <Chip size="sm" variant="soft" color="neutral">
                    Top P: {item.top_p ? item.top_p : 'N/A'}
                  </Chip>
                  <Box sx={{ flex: 1 }} />
                  <IconButton
                    size="sm"
                    color="neutral"
                    sx={{ ml: 1 }}
                    onClick={async () => {
                      if (
                        window.confirm(
                          'Are you sure you want to delete this audio file?',
                        )
                      ) {
                        const deleteURL = getAPIFullPath(
                          'conversations',
                          ['deleteAudioFile'],
                          {
                            id: item.id,
                            experimentId,
                          },
                        );
                        await fetchWithAuth(deleteURL, {
                          method: 'DELETE',
                        });
                        mutateHistory();
                      }
                    }}
                  >
                    <Trash2Icon size={18} />
                  </IconButton>
                </Box>
              </ListItem>
            ))
          ) : (
            <ListItem>
              <Typography level="body-sm" color="neutral">
                No audio history available
              </Typography>
            </ListItem>
          )}
        </List>
      </Sheet>
    );
  },
);

AudioHistory.displayName = 'AudioHistory';

export default AudioHistory;
