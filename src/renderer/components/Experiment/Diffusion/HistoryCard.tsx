import React from 'react';
import { Card, CardContent, Box, Typography, Checkbox } from '@mui/joy';
import { HistoryImage } from './History';

interface HistoryCardProps {
  item: HistoryImage;
  selectionMode: boolean;
  selectedImages: Set<string>;
  toggleImageSelection: (id: string) => void;
  viewImage: (id: string) => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  selectionMode,
  selectedImages,
  toggleImageSelection,
  viewImage,
}) => {
  return (
    <Card
      onClick={() =>
        selectionMode ? toggleImageSelection(item.id) : viewImage(item.id)
      }
      sx={{
        cursor: 'pointer',
        position: 'relative',
        border:
          selectionMode && selectedImages.has(item.id)
            ? '2px solid var(--joy-palette-primary-500)'
            : '1px solid var(--joy-palette-neutral-200)',
        '&:hover': {
          backgroundColor: selectionMode
            ? 'var(--joy-palette-primary-50)'
            : 'var(--joy-palette-background-level1)',
        },
      }}
    >
      {selectionMode && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            pointerEvents: 'none', // Prevent checkbox from blocking card click
          }}
        >
          <Checkbox
            checked={selectedImages.has(item.id)}
            color="primary"
            size="sm"
            readOnly
          />
        </Box>
      )}
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
        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
          {item.timestamp
            ? new Date(item.timestamp).toLocaleDateString()
            : 'Unknown date'}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default HistoryCard;
