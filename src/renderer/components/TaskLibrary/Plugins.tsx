/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Typography from '@mui/joy/Typography';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

export default function TaskLibrary({}) {
  const { experimentInfo } = useExperimentInfo();

  // Hardcoded list of common ML tasks
  const tasks = [
    {
      id: 'image-classification',
      title: 'Image Classification',
      description: 'Assign a label to an entire image (e.g., cat vs. dog).',
    },
    {
      id: 'object-detection',
      title: 'Object Detection',
      description: 'Locate and classify multiple objects within an image.',
    },
    {
      id: 'semantic-segmentation',
      title: 'Semantic Segmentation',
      description: 'Predict a class for every pixel in the image.',
    },
    {
      id: 'text-classification',
      title: 'Text Classification',
      description: 'Classify documents or text snippets into categories.',
    },
    {
      id: 'machine-translation',
      title: 'Machine Translation',
      description: 'Translate text from one language to another.',
    },
    {
      id: 'speech-recognition',
      title: 'Speech Recognition',
      description: 'Convert spoken audio into text.',
    },
    {
      id: 'time-series-forecasting',
      title: 'Time Series Forecasting',
      description: 'Predict future values based on temporal data.',
    },
    {
      id: 'anomaly-detection',
      title: 'Anomaly Detection',
      description: 'Identify unusual patterns or outliers in data.',
    },
  ];

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Task library list */}
      <List
        sx={{
          overflow: 'auto',
          p: 1,
          gap: 1,
        }}
      >
        {tasks.map((task) => (
          <ListItem key={task.id} sx={{ alignItems: 'flex-start' }}>
            <ListItemDecorator sx={{ mt: '4px' }}>
              {/* simple icon placeholder */}
              <span role="img" aria-label="task">
                🧠
              </span>
            </ListItemDecorator>
            <ListItemContent>
              <Typography fontWeight="lg">{task.title}</Typography>
              <Typography level="body2" textColor="text.tertiary">
                {task.description}
              </Typography>
            </ListItemContent>
          </ListItem>
        ))}
      </List>
    </Sheet>
  );
}
