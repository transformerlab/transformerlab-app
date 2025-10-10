/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import { Button, LinearProgress, Stack } from '@mui/joy';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { PlayIcon } from 'lucide-react';
import { useAnalytics } from 'renderer/components/Shared/analytics/AnalyticsContext';

export default function LoRATrainingRunButton({
  initialMessage,
  action = () => {},
  trainingTemplate,
  jobsMutate,
  experimentId,
}) {
  const [progress, setProgress] = useState(0);
  const analytics = useAnalytics();

  // The name of the training template is stored in an unparsed JSON string
  // in the `config` field of the training template.
  let job_data = trainingTemplate;
  let jobConfig = job_data?.config;
  let pluginName = '';
  if (jobConfig) {
    try {
      jobConfig = JSON.parse(jobConfig);
    } catch (e) {
      console.error('Failed to parse jobConfig:', e);
      jobConfig = {};
    }
    pluginName = jobConfig?.plugin_name || '';
  }
  return (
    <Button
      variant="solid"
      color="primary"
      endDecorator={<PlayIcon size="14px" />}
      onClick={async () => {
        // Track the event with analytics
        analytics.track('Task Queued', {
          task_type: 'TRAIN',
          plugin_name: pluginName,
        });
        await chatAPI.authenticatedFetch(
          chatAPI.Endpoints.Tasks.Queue(trainingTemplate.template_id),
        );
        return;
        const model = job_data.model_name;
        console.log(job_data);
        const dataset = job_data.dataset;

        const models_downloaded = await chatAPI
          .authenticatedFetch(chatAPI.Endpoints.Models.LocalList())
          .then((response) => {
            // First check that the API responded correctly
            if (response.ok) {
              return response.json();
            } else {
              const error_msg = `${response.statusText}`;
              throw new Error(error_msg);
            }
          })
          .then((data) => {
            // Then check the API responose to see if there was an error.
            console.log('Server response:', data);
            if (data?.status == 'error') {
              throw new Error(data.message);
            }
            return data;
          })
          .catch((error) => {
            alert(error);
            return false;
          });
        let modelInLocalList = false;
        if (model === 'unknown') {
          modelInLocalList = true;
        } else {
          models_downloaded.forEach((modelData) => {
            if (modelData.model_id == model || modelData.local_path === model) {
              modelInLocalList = true;
            }
          });
        }

        const datasets_downloaded = await chatAPI
          .authenticatedFetch(chatAPI.Endpoints.Dataset.LocalList())
          .then((response) => {
            // First check that the API responded correctly
            if (response.ok) {
              return response.json();
            } else {
              const error_msg = `${response.statusText}`;
              throw new Error(error_msg);
            }
          })
          .then((data) => {
            // Then check the API responose to see if there was an error.
            console.log('Server response:', data);
            if (data?.status == 'error') {
              throw new Error(data.message);
            }
            return data;
          })
          .catch((error) => {
            alert(error);
            return false;
          });

        let datasetInLocalList = false;
        datasets_downloaded.forEach((datasetData) => {
          if (datasetData.dataset_id == dataset) {
            datasetInLocalList = true;
          }
        });

        if (modelInLocalList && datasetInLocalList) {
          // Use fetch API to call endpoint
          await chatAPI
            .authenticatedFetch(
              chatAPI.Endpoints.Jobs.Create(
                experimentId,
                'TRAIN',
                'QUEUED',
                JSON.stringify(job_data),
              ),
            )
            .then((response) => response.json())
            .then((data) => console.log(data))
            .catch((error) => console.log(error));
          jobsMutate();
        } else {
          let msg =
            'Warning: To use this recipe you will need to download the following:';
          let shouldDownload = false;

          if (!datasetInLocalList) {
            msg += '\n- Dataset: ' + dataset;
          }

          if (!modelInLocalList) {
            msg += '\n- Model: ' + model;
          }
          msg += '\n\nDo you want to download these now?';
          if (confirm(msg)) {
            // Use confirm() to get Accept/Cancel
            if (!datasetInLocalList) {
              chatAPI
                .authenticatedFetch(chatAPI.Endpoints.Dataset.Download(dataset))
                .then((response) => {
                  if (!response.ok) {
                    console.log(response);
                    throw new Error(`HTTP Status: ${response.status}`);
                  }
                  return response.json();
                })
                .catch((error) => {
                  alert('Dataset download failed:\n' + error);
                });
            }
            if (!modelInLocalList) {
              chatAPI
                .downloadModelFromHuggingFace(model)
                .then((response) => {
                  if (response.status == 'error') {
                    console.log(response);
                    throw new Error(`${response.message}`);
                  } else if (response.status === 'requires_file_selection') {
                    throw new Error(
                      `This model contains multiple GGUF files. Please download it manually from the Model Zoo and select the specific file you need.`,
                    );
                  }
                  return response;
                })
                .catch((error) => {
                  alert('Model download failed:\n' + error);
                });
            }
          } else {
            // User pressed Cancel
            alert('Downloads cancelled. This recipe might not work correctly.');
          }
        }
      }}
    >
      {initialMessage}
    </Button>
  );
}
