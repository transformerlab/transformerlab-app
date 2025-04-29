import SelectAModel from './SelectAModel';
import SelectEmbeddingModel from './SelectEmbeddingModel';

export default function FoundationHome({
  pickAModelMode = false,
  experimentInfo,
  setFoundation = (name: string) => {},
  setAdaptor = (name: string) => {},
  setLogsDrawerOpen = null,
}) {
  return (
    <SelectAModel
      experimentInfo={experimentInfo}
      setFoundation={setFoundation}
      setAdaptor={setAdaptor}
      setLogsDrawerOpen={setLogsDrawerOpen}
    />
  );
}
