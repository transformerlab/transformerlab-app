import SelectAModel from './SelectAModel';

export default function FoundationHome({
  pickAModelMode = false,
  experimentInfo,
  setFoundation = (name: string) => {},
  setAdaptor = (name: string) => {},
}) {
  return (
    <SelectAModel
      experimentInfo={experimentInfo}
      setFoundation={setFoundation}
      setAdaptor={setAdaptor}
    />
  );
}
