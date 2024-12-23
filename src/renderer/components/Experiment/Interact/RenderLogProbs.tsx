import { Chip, Tooltip, Typography } from '@mui/joy';

function renderToken(token) {
  if (token === ' ') {
    return '␣';
  }
  if (token === '\n') {
    return <>'↵'</>;
  }
  return token;
}

function logProbToProbability(logprob) {
  return Math.round(Math.exp(logprob) * 100) / 100;
}

function lpgProbToPercent(logprob) {
  const value = Math.round(logProbToProbability(logprob) * 100);
  return value.toFixed(2);
}

function logProbToColor(logprob: number): string {
  const probability = logProbToProbability(logprob);
  const hue = Math.floor(probability * 100); // Reverse the hue calculation
  const color = `hsl(${hue}, 90%, 89%)`; // Use HSL for more pleasing colors
  return color;
}

function renderListOfLogProbs(logProbs, chosenToken, color) {
  return logProbs.map((logprob, index) => (
    <div
      style={{
        backgroundColor: chosenToken === logprob?.token ? color : 'white',
      }}
    >
      {lpgProbToPercent(logprob?.logprob)}%: {logprob?.token}
    </div>
  ));
}

function SingleChip({ index, logprob }) {
  return (
    <Tooltip
      title={renderListOfLogProbs(
        logprob?.logprobs?.top_logprobs,
        logprob?.text,
        logProbToColor(logprob?.logprobs?.logprob)
      )}
      key={index}
      variant="outlined"
    >
      <span
        style={{
          backgroundColor: logProbToColor(logprob?.logprobs?.logprob),
          lineHeight: '1.0',
          color: 'black',
          margin: '0px',
        }}
      >
        {renderToken(logprob?.text)}
      </span>
    </Tooltip>
  );
}

const RenderLogProbs = ({ logProbs }) => {
  return (
    <Typography level="body-lg">
      {logProbs?.map((logprob, index) => (
        <SingleChip index={index} logprob={logprob} />
      ))}
    </Typography>
  );
};

export default RenderLogProbs;
