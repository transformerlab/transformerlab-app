import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Checkbox,
  CardActions,
  IconButton,
  Chip,
} from '@mui/joy';
import { Trash2Icon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { HistoryImage } from './types';

interface HistoryCardProps {
  item: HistoryImage;
  selectionMode: boolean;
  selectedImages: Set<string>;
  toggleImageSelection: (id: string) => void;
  viewImage: (id: string) => void;
  setImageToDelete: (id: string) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  selectionMode,
  selectedImages,
  toggleImageSelection,
  viewImage,
  setImageToDelete,
  setDeleteConfirmOpen,
}) => {
  const numImages = item.num_images || item.metadata?.num_images || 1;
  const hasMultipleImages = numImages > 1;

  // Function to render multiple images in a grid
  const renderImages = () => {
    if (hasMultipleImages) {
      // Show first few images in a grid
      const maxDisplayImages = Math.min(4, numImages);
      const gridCols = maxDisplayImages === 1 ? 1 : 2;

      return (
        <Box
          sx={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 0.5,
            aspectRatio: '1',
          }}
        >
          {Array.from({ length: maxDisplayImages }, (_, index) => (
            <img
              key={index}
              src={getAPIFullPath('diffusion', ['getImage'], {
                imageId: item.id,
                index,
              })}
              alt={`Generated image ${index + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius:
                  index === 0 && maxDisplayImages === 1 ? '6px' : '3px',
              }}
            />
          ))}
          {numImages > maxDisplayImages && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                px: 1,
                py: 0.5,
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              +{numImages - maxDisplayImages}
            </Box>
          )}
        </Box>
      );
    } else {
      // Single image display
      return (
        <img
          src={getAPIFullPath('diffusion', ['getImage'], {
            imageId: item.id,
            index: 0,
          })}
          alt="generated"
          style={{
            borderRadius: '6px',
            width: '100%',
            aspectRatio: '1',
            objectFit: 'cover',
          }}
        />
      );
    }
  };

  return (
    <Card
      sx={{
        position: 'relative',
        border:
          selectionMode && selectedImages.has(item.id)
            ? '2px solid var(--joy-palette-primary-500)'
            : '1px solid var(--joy-palette-neutral-200)',

        // Hide CardActions by default, show on hover
        '& .history-card-actions': {
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.2s',
        },
        '&:hover .history-card-actions': {
          opacity: 1,
          pointerEvents: 'auto',
        },
      }}
    >
      {selectionMode && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 100,
          }}
        >
          <Checkbox
            checked={selectedImages.has(item.id)}
            color="success"
            variant="outlined"
            size="sm"
            readOnly
            onClick={() =>
              selectionMode ? toggleImageSelection(item.id) : viewImage(item.id)
            }
          />
        </Box>
      )}

      {/* Multiple images indicator */}
      {hasMultipleImages && (
        <Chip
          size="sm"
          variant="soft"
          color="primary"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 10,
            fontSize: '10px',
            minHeight: 'auto',
            py: 0.25,
            px: 0.5,
          }}
        >
          {numImages} images
        </Chip>
      )}

      <CardContent
        sx={{ cursor: 'pointer' }}
        onClick={() =>
          selectionMode ? toggleImageSelection(item.id) : viewImage(item.id)
        }
      >
        {renderImages()}
        <Typography
          level="title-md"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            mt: 2,
            mb: 0,
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
      <CardActions
        className="history-card-actions"
        sx={{
          justifyContent: 'flex-end',
          position: 'absolute',
          p: 1,
          bottom: 0,
          right: 0,
        }}
      >
        <IconButton variant="plain" color="danger">
          <Trash2Icon
            onClick={() => {
              setImageToDelete(item?.id);
              setDeleteConfirmOpen(true);
            }}
          />
        </IconButton>
      </CardActions>
    </Card>
  );
};

export default HistoryCard;
