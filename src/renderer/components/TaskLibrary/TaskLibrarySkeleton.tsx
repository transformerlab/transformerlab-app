import ListItem from '@mui/joy/ListItem';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Box from '@mui/joy/Box';
import Skeleton from '@mui/joy/Skeleton';

interface TaskLibrarySkeletonProps {
  count?: number;
}

export default function TaskLibrarySkeleton({
  count = 3,
}: TaskLibrarySkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <ListItem
          key={`skeleton-${index}`}
          sx={{
            alignItems: 'flex-start',
            display: 'flex',
            gap: 1,
            padding: 2,
          }}
          variant="outlined"
        >
          <ListItemDecorator sx={{ mt: '4px' }}>
            <Skeleton variant="circular" width={24} height={24} />
          </ListItemDecorator>

          <ListItemContent sx={{ minWidth: 0, flex: 1 }}>
            <Skeleton variant="text" level="body-lg" width="40%" />
            <Skeleton
              variant="text"
              level="body-sm"
              width="80%"
              sx={{ mt: 0.5 }}
            />
            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
              <Skeleton
                variant="rectangular"
                width={60}
                height={14}
                sx={{ borderRadius: 'sm' }}
              />
            </Box>
          </ListItemContent>

          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Skeleton
              variant="rectangular"
              width={80}
              height={28}
              sx={{ borderRadius: 'sm' }}
            />
          </Box>
        </ListItem>
      ))}
    </>
  );
}
