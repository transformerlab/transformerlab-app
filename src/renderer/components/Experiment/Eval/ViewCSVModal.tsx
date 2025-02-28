import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
  ModalClose,
  ModalDialog,
  Table,
  Button,
} from '@mui/joy';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

function formatColumnNames(name) {
  return name
    .replace(/([A-Z])/g, ' $1') // Convert Camel Case to spaced
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/_/g, ' '); // Replace underscores with spaces
}

function formatEvalData(data) {
  let header = data?.header;
  let body = data?.body;
  const formattedData: any[] = [];

  if (!data) {
    return formattedData;
  }

  // if not a grouped report from the backend
  if (header[0] !== 'test_case_id') {
    return data;
  }

  // remove the header named "metric_name"
  if (header[1] === 'metric_name') {
    header = header.slice(1);
  }

  const seen = new Set();
  body.forEach((row) => {
    if (!seen.has(row[0])) {
      seen.add(row[0]);
      const newRow = [row[0]];
      newRow.push({ [row[1]]: row[2] });
      // push the rest of the columns:
      for (let i = 3; i < row.length; i++) {
        newRow.push(row[i]);
      }
      formattedData.push(newRow);
    } else {
      const index = formattedData.findIndex((r) => r[0] === row[0]);
      let newScore = [];
      // if formattedData[index][1] is already an array, use it; otherwise wrap it in one.
      if (Array.isArray(formattedData[index][1])) {
        newScore = formattedData[index][1];
      } else {
        newScore.push(formattedData[index][1]);
      }
      newScore.push({ [row[1]]: row[2] });
      formattedData[index][1] = newScore;
    }
  });

  return { header: header, body: formattedData };
}

function heatedColor(value) {
  // Clamp value between 0 and 1 for hue calculations.
  const norm = Math.min(Math.max(parseFloat(value), 0), 1);
  const h = norm * 240;
  return `hsla(${h}, 100%, 50%, 0.3)`;
}

// Single helper for rendering scores.
// It supports a score passed as a single value or as an array of [score, scoreNormalized] pairs.
function formatScore(score) {
  if (Array.isArray(score)) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {score.map((item, idx) => {
          let parsedItem = item;
          let metricName = "";
          let jsonParsed = false;
          // If the item is an object (but not an array)
          if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            // Look for any property that looks like a JSON array string.
            for (const key in item) {
              const value = item[key];
              if (
                typeof value === "string" &&
                value.trim().startsWith("[") &&
                value.trim().endsWith("]")
              ) {
                try {

                  parsedItem = JSON.parse(value);
                  let [score, scoreNorm] = parsedItem
                  parsedItem = [key, score, scoreNorm];
                  jsonParsed = true;
                } catch (e) {
                  // If parsing fails, keep the original item.
                }
                break;
              }
            }
            // If no JSON string was found and there's exactly one key,
            // assume legacy format: { metricName: [score, scoreNormalized] }
            if (!jsonParsed && Object.keys(item).length === 1) {

              metricName = Object.keys(item)[0];
              let score = item[metricName];
              if (Array.isArray(score) && score.length === 1) {
                parsedItem = [metricName, score[0], score[0]];
              }
              parsedItem = [metricName, score, score];
            }
          }

          if (Array.isArray(parsedItem) && parsedItem.length === 3) {
            const [metricName, rawScore, scoreNormalized] = parsedItem;
            const parsed = parseFloat(rawScore);
            let bg;
            if (scoreNormalized === -1) {
              bg = "inherit";
            } else {
              bg = heatedColor(scoreNormalized);
            }
            return (
              <Box
                key={idx}
                sx={{
                  backgroundColor: bg,
                  padding: "0 5px",
                  fontWeight: "normal",
                  flex: "1 0 0",
                  overflow: "hidden",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #ccc"

                }}
              >
                {metricName ? `${metricName}: ${parsed.toFixed(5)}` : parsed.toFixed(5)}
              </Box>
            );
          } else {
            // Fallback: treat parsedItem as a simple number.
            const parsed = parseFloat(parsedItem);
            return (
              <Box
                key={idx}
                sx={{
                  backgroundColor: heatedColor(parsed),
                  padding: "0 5px",
                  fontWeight: "normal",
                  flex: "1 0 0",
                  overflow: "hidden",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #ccc",
                }}
              >
                {parsed.toFixed(5)}
              </Box>
            );
          }
        })}
      </Box>
    );
  } else {
    // Handle a single score value.

// Check legacy format: { metricName: score }
if (typeof score === "object" && score !== null && Object.keys(score).length === 1) {
  const metricName = Object.keys(score)[0];
  const rawScore = score[metricName];
  let parsed;
  let bg;
  let scoreNormalized;
  const parsedData = JSON.parse(rawScore);
  if (!isNaN(parsedData[0])) {
    [parsed, scoreNormalized] = parsedData;
    bg = heatedColor(scoreNormalized);
  } else {
    parsed = parseFloat(rawScore);
    bg = heatedColor(parsed);
  }

  if (!isNaN(parsed)) {
    return (
      <Box
        sx={{
          backgroundColor: bg,
          padding: "0 5px",
          fontWeight: "normal",
          flex: "1 0 0",
          overflow: "hidden",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #ccc"
        }}
      >
        {`${metricName}: ${parsed.toFixed(5)}`}
      </Box>
    );
  }
  return JSON.stringify(score);
}

const parsed = parseFloat(score);
if (!isNaN(parsed)) {
  return (
    <Box
      sx={{
        backgroundColor: heatedColor(parsed),
        padding: "0 5px",
        fontWeight: "normal",
        flex: "1 0 0",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #ccc",
      }}
    >
      {parsed.toFixed(5)}
    </Box>
  );
}
return score;
  }
}

const ViewCSVModal = ({ open, onClose, jobId, fetchCSV }) => {
  const [report, setReport] = useState({});

  useEffect(() => {
    if (open && jobId) {
      fetchCSV(jobId).then((data) => {
        try {
          setReport(formatEvalData(JSON.parse(data)));
        } catch (e) {
          setReport({ header: ['Error'], body: [[data]] });
        }
      });
    }
  }, [open, jobId, fetchCSV]);

  const handleDownload = async () => {
    const response = await fetch(
      chatAPI.Endpoints.Experiment.GetAdditionalDetails(jobId, 'download')
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${jobId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', height: '90vh', pt: 5 }}>
        <ModalClose />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography level="h4" mb={2}>
            Additional Output from Job: {jobId}
          </Typography>
          <Button onClick={handleDownload} variant="outlined">
            Download Report
          </Button>
        </Box>
        <Box sx={{ overflow: 'auto' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                {report?.header &&
                  report.header.map((col) => (
                    <th key={col}>{formatColumnNames(col)}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {report?.body?.map((row, i) => (
                <tr key={i}>
                  {row.map((col, j) => (
                    <td key={j}>
                      {report?.header[j] === 'score' ? (
                        <div
                          style={{
                            height: '100%',
                            width: '100%',
                            overflow: 'hidden',
                            padding: '0',
                            fontWeight: 'bold',
                          }}
                        >
                          {formatScore(col)}
                        </div>
                      ) : (
                        <div
                          style={{
                            height: '100%',
                            padding: '0 5px',
                            maxHeight: '100px',
                          }}
                        >
                          {col}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
      </ModalDialog>
    </Modal>
  );
};

export default ViewCSVModal;
