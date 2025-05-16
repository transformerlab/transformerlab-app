/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import { Button, CircularProgress } from '@mui/joy';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

interface SelectButtonProps {
  setFoundation: (model: any) => void;
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

  // Helper to get architecture from model object
  function getModelArchitecture(m: any) {
    return m?.json_data?.architecture || m?.architecture || '';
  }

  // Helper to get experiment id
  function getExperimentId() {
    return experimentInfo?.id;
  }

  async function handleSelect() {
    if (setEmbedding) {
      setEmbedding(model);
      return;
    }
    setSelected(true);
    setFoundation(model);
    setAdaptor('');

    const experimentId = getExperimentId();
    const modelArchitecture = getModelArchitecture(model);
    if (!experimentId || !modelArchitecture) {
      setSelected(false);
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
      const engines = await resp.json();
      if (engines && engines.length > 0) {
        const engine = engines[0];
        // Update inferenceParams in experiment config
        await fetch(
          chatAPI.Endpoints.Experiment.UpdateConfig(
            experimentId,
            'inferenceParams',
            JSON.stringify({
              inferenceEngine: engine.uniqueId,
              inferenceEngineFriendlyName: engine.name || '',
            }),
          ),
        );
      }
    } catch (e) {
      // fail silently, user can still set engine manually
    }
    setSelected(false);
  }

  return selected ? (
    <Button
      size="sm"
      variant="soft"
      onClick={() => {
        setSelected(false);
      }}
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
