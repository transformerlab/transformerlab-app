/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import { Button, CircularProgress } from '@mui/joy';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

interface SelectButtonProps {
  setFoundation: (model: any, additionalConfigs?: any) => void;
  model: any;
  setAdaptor: (name: string) => void;
  setEmbedding?: (model: any) => void;
  experimentInfo?: any;
}

export default function SelectButton({
  setFoundation,
  model,
  setAdaptor,
  setEmbedding,
  experimentInfo,
}: SelectButtonProps) {
  const [selected, setSelected] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Helper to get architecture from model object
  function getModelArchitecture(m: any) {
    return m?.json_data?.architecture || m?.architecture || '';
  }

  const handleSelect = React.useCallback(async () => {
    // Prevent multiple concurrent calls
    if (isProcessing) {
      return;
    }

    if (setEmbedding) {
      setEmbedding(model);
      return;
    }

    setIsProcessing(true);
    setSelected(true);

    const experimentId = experimentInfo?.id;
    const modelArchitecture = getModelArchitecture(model);
    if (!experimentId || !modelArchitecture) {
      setSelected(false);
      setIsProcessing(false);
      return;
    }

    try {
      // Fetch compatible inference engines
      const url = chatAPI.Endpoints.Experiment.ListScriptsOfType(
        experimentId,
        'loader',
        `model_architectures:${modelArchitecture}`,
      );

      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      const engines = await resp.json();
      const additionalConfigs: any = {};

      if (engines && engines.length > 0) {
        const engine = engines[0];
        additionalConfigs.inferenceParams = JSON.stringify({
          inferenceEngine: engine.uniqueId,
          inferenceEngineFriendlyName: engine.name || '',
        });
      }

      // Update foundation with inference params in one request
      setFoundation(model, additionalConfigs);
    } catch (e) {
      // Silently handle errors - user can still set engine manually
      // Error details available in network tab for debugging
    } finally {
      setSelected(false);
      setIsProcessing(false);
    }
  }, [isProcessing, setEmbedding, model, setFoundation, experimentInfo]);

  const handleCancel = React.useCallback(() => {
    setSelected(false);
  }, []);

  return selected ? (
    <Button
      size="sm"
      variant="soft"
      onClick={handleCancel}
      startDecorator={<CircularProgress thickness={2} />}
    >
      Loading Model
    </Button>
  ) : (
    <Button size="sm" variant="soft" color="success" onClick={handleSelect}>
      Select
    </Button>
  );
}

SelectButton.defaultProps = {
  setEmbedding: undefined,
  experimentInfo: undefined,
};
