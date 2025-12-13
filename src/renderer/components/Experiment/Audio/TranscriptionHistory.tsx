import React, { useEffect, useState } from 'react';
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

interface TranscriptionHistoryItem {
  id: string;
  type: string;
  audio_folder: string;
  audio_path: string;
  filename: string;
  model: string;
  text_format: string;
}

interface TranscriptionHistoryProps {
  transcriptionHistory: TranscriptionHistoryItem[] | null | undefined;
  experimentId: string;
  mutateHistory: () => void;
}

const TranscriptionHistory = React.forwardRef<
  HTMLDivElement,
  TranscriptionHistoryProps
>(({ transcriptionHistory, experimentId, mutateHistory }, ref) => {
  const [textContents, setTextContents] = useState<{ [key: string]: string }>(
    {},
  );

  // Fetch text for each item
  useEffect(() => {
    if (Array.isArray(transcriptionHistory)) {
      transcriptionHistory.forEach(async (item) => {
        if (!textContents[item.id]) {
          const textUrl = getAPIFullPath(
            'conversations',
            ['downloadTranscriptionFile'],
            {
              experimentId,
              filename: item.filename,
            },
          );
          try {
            const response = await fetchWithAuth(textUrl);
            const text = await response.text();
            setTextContents((prev) => ({ ...prev, [item.id]: text }));
          } catch (err) {
            setTextContents((prev) => ({
              ...prev,
              [item.id]: 'Error loading transcription.',
            }));
          }
        }
      });
    }
  }, [transcriptionHistory, experimentId]);

  return (
    <Sheet
      ref={ref}
      variant="plain"
      sx={{ borderRadius: 'md', overflowY: 'scroll', pr: 1 }}
    >
      <List sx={{ p: 0 }}>
        {Array.isArray(transcriptionHistory) &&
        transcriptionHistory.length > 0 ? (
          transcriptionHistory.map((item) => (
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
              {/* Audio Player first */}
              {item.audio_path && (
                <Box sx={{ mb: 2 }}>
                  <AudioPlayer
                    audioData={{
                      audio_data_url: getAPIFullPath(
                        'conversations',
                        ['downloadAudioFileWithAudioFolder'],
                        {
                          experimentId,
                          filename: item.audio_path,
                          audioFolder: 'uploaded_audio',
                        },
                      ),
                    }}
                    metadata={{
                      path: item.audio_path,
                      duration: undefined,
                    }}
                  />
                </Box>
              )}

              {/* Text from .txt file */}
              <Box sx={{ flex: 1, mr: 2 }}>
                <Typography level="body-md" sx={{ mb: 0.5 }}>
                  {textContents[item.id]
                    ? `"${
                        textContents[item.id].length > 300
                          ? `${textContents[item.id].slice(0, 300)}…`
                          : textContents[item.id]
                      }"`
                    : 'Loading transcription...'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip size="sm" variant="soft" color="primary">
                  {item.model.split('/').pop()}
                </Chip>
                <Chip size="sm" variant="soft" color="neutral">
                  {item.text_format.toUpperCase()}
                </Chip>
                <Box sx={{ flex: 1 }} />
                <IconButton
                  size="sm"
                  color="neutral"
                  sx={{ ml: 1 }}
                  onClick={async () => {
                    if (
                      window.confirm(
                        'Are you sure you want to delete this audio/text file?',
                      )
                    ) {
                      // Delete text file
                      const deleteTextURL = getAPIFullPath(
                        'conversations',
                        ['deleteTranscriptionFile'],
                        {
                          id: item.id,
                          experimentId,
                        },
                      );
                      await fetchWithAuth(deleteTextURL, {
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
              No transcription history available
            </Typography>
          </ListItem>
        )}
      </List>
    </Sheet>
  );
});

TranscriptionHistory.displayName = 'TranscriptionHistory';

export default TranscriptionHistory;
