import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Checkbox,
  CardActions,
  IconButton,
  Button,
} from '@mui/joy';
import { HistoryImage } from './History';
import { Endpoints, getFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { DownloadIcon, HeartIcon, Trash2Icon } from 'lucide-react';

interface HistoryCardProps {
  item: HistoryImage;
  selectionMode: boolean;
  selectedImages: Set<string>;
  toggleImageSelection: (id: string) => void;
  viewImage: (id: string) => void;
  setImageToDelete;
  setDeleteConfirmOpen;
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
      <CardContent
        sx={{ cursor: 'pointer' }}
        onClick={() =>
          selectionMode ? toggleImageSelection(item.id) : viewImage(item.id)
        }
      >
        <img
          src={Endpoints.Diffusion.GetImage(item?.id)}
          alt="generated"
          style={{ borderRadius: '6px' }}
        />
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
