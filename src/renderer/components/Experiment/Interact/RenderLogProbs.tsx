import { Chip, Tooltip, Typography } from '@mui/joy';

function renderToken(token) {
  if (token === ' ') {
    return '␣';
  }
  if (token === '\n') {
    return (
      <>
        ↵
        <br />
      </>
    );
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
  if (!logProbs) {
    return null;
  }

  var logProbsAsArray = Object.entries(logProbs);
  logProbsAsArray.sort((a, b) => b[1] - a[1]);

  return logProbsAsArray.map((logprob, index) => (
    <div
      style={{
        backgroundColor: chosenToken === logprob[0] ? color : 'white',
      }}
    >
      {lpgProbToPercent(logprob[1])}%: {renderToken(logprob[0])}
    </div>
  ));
}

function SingleChip({ index, logprob }) {
  return (
    <Tooltip
      title={renderListOfLogProbs(
        logprob?.top_logprobs?.[0],
        logprob?.tokens?.[0],
        logProbToColor(logprob?.token_logprobs?.[0]),
      )}
      key={index}
      variant="outlined"
    >
      <span
        style={{
          backgroundColor: logProbToColor(logprob?.token_logprobs?.[0]),
          lineHeight: '1.0',
          color: 'black',
          margin: '0px',
        }}
      >
        {/* <pre>{JSON.stringify(logprob)}</pre> */}
        {renderToken(logprob?.tokens?.[0])}
      </span>
    </Tooltip>
  );
}

const RenderLogProbs = ({ logProbs }) => {
  return (
    <Typography level="body-lg">
      {Array.isArray(logProbs) &&
        logProbs?.map((logprob, index) => (
          <SingleChip index={index} logprob={logprob?.logprobs} />
        ))}
      {!Array.isArray(logProbs) &&
        logProbs?.tokens?.map((token, index) => token)}
    </Typography>
  );
};

export default RenderLogProbs;
