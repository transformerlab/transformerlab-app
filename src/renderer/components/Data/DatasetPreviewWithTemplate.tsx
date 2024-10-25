import { useEffect, useState } from 'react';
import {
  Button,
  Table,
  CircularProgress,
  Box,
  IconButton,
  iconButtonClasses,
  Alert,
  Chip,
  LinearProgress,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { ChevronLeftIcon, ChevronRightIcon, Sheet } from 'lucide-react';
import useSWR from 'swr';
const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((data) => data);

const DatasetTableWithTemplate = ({ datasetId, template }) => {
  const [pageNumber, setPageNumber] = useState(1);
  const [numOfPages, setNumOfPages] = useState(1);
  const [datasetLen, setDatasetLen] = useState(null);
  let pageSize = 4; //Set the number of rows per page
  const offset = (pageNumber - 1) * pageSize; //Calculate current row number to start from
  //Set the pagination for the dataset
  const setPagination = (totalRows, rowsPerPage) => {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    setNumOfPages(totalPages);
  };
  const {
    data: result,
    error,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.Dataset.PreviewWithTemplate(
      datasetId,
      encodeURIComponent(template),
      offset,
      pageSize
    ),
    fetcher
  );

  useEffect(() => {
    setDatasetLen(null);
    setPageNumber(1);
    setNumOfPages(1);
  }, [datasetId]);

  useEffect(() => {
    if (result && result.data && datasetLen === null) {
      setDatasetLen(result?.data['len']);
      setPagination(result?.data['len'], pageSize);
    }
  }, [result, pageSize, datasetLen]);

  if (!result?.data?.rows) {
    if (isLoading) {
      return <LinearProgress />;
    }
    return '';
  }
  return (
    <>
      {/* <pre>{JSON.stringify(data, null, 2)}</pre> */}
      <Box sx={{ overflow: 'auto', height: '100%' }}>
        {isLoading && <LinearProgress />}
        {result?.status == 'error' && (
          <Alert color="danger">{result?.message}</Alert>
        )}
      </Box>
      {result?.data && (
        <Table sx={{ tableLayout: 'auto', overflow: 'scroll' }}>
          <thead>
            <tr>
              <th>Rendered (this is what the model sees)</th>
              <th>Fields</th>
              {/* {Object.keys(data.data[0]).map((key) => {
                if (key.startsWith('__') && key.endsWith('__')) {
                  return null;
                } else {
                  return <th key={key}>{key}</th>;
                }
              })} */}
            </tr>
          </thead>
          <tbody>
            {result?.data?.rows?.map((row) => (
              <tr key={row?.['__index__']}>
                <td>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    <Box
                      style={{
                        backgroundColor: 'var(--joy-palette-success-100)',
                        padding: '5px',
                      }}
                    >
                      {row?.['__formatted__']}
                    </Box>
                  </pre>
                </td>
                {/* {Object.entries(row).map(([key, value]) => {
                  // if key starts and ends with __ then skip:
                  if (key.startsWith('__') && key.endsWith('__')) {
                    return null;
                  } else {
                    return <td>{value}</td>;
                  }
                })} */}
                <td>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {/* {JSON.stringify(row, null, 2)} */}
                    {Object.entries(row).map(([key, value]) => {
                      if (key.startsWith('__') && key.endsWith('__')) {
                        return null;
                      } else {
                        return (
                          <Box>
                            {typeof value === 'string' ? (
                              <>
                                <Chip>{key}</Chip>
                                {value?.length > 200 ? (
                                  <>
                                    {value.substring(0, 200)}
                                    ...
                                  </>
                                ) : (
                                  value
                                )}
                              </>
                            ) : (
                              <pre>{JSON.stringify(value, null, 2)}</pre>
                            )}
                          </Box>
                        );
                      }
                    })}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Box
        className="Pagination"
        sx={{
          pt: 2,
          gap: 1,
          [`& .${iconButtonClasses.root}`]: { borderRadius: '50%' },
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {pageNumber > 1 ? (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            onClick={() => setPageNumber(pageNumber - 1)}
          >
            <ChevronLeftIcon /> Previous
          </Button>
        ) : (
          <div style={{ width: '78px', height: '30px' }} />
        )}
        <Box sx={{ flex: 1, alignItems: 'center' }} />
        <IconButton
          key={1}
          size="sm"
          variant={Number(1) === pageNumber ? 'outlined' : 'plain'}
          color="neutral"
          onClick={() => setPageNumber(Number(1))}
        >
          {1}
        </IconButton>
        {pageNumber > 4 ? '…' : <div />}
        {Array.from(
          { length: Math.min(5, numOfPages) },
          (_, i) => pageNumber + i - 2
        )
          .filter((page) => page >= 2 && page < numOfPages)

          .map((page) => (
            <IconButton
              key={page}
              size="sm"
              variant={page === pageNumber ? 'outlined' : 'plain'}
              color="neutral"
              onClick={() => setPageNumber(Number(page))}
            >
              {page}
            </IconButton>
          ))}
        {pageNumber < numOfPages - 4 ? '…' : <div />}
        {numOfPages != 1 && (
          <IconButton
            key={numOfPages}
            size="sm"
            variant={Number(numOfPages) === pageNumber ? 'outlined' : 'plain'}
            color="neutral"
            onClick={() => setPageNumber(Number(numOfPages))}
          >
            {numOfPages}
          </IconButton>
        )}
        <Box sx={{ flex: 1 }} />
        {pageNumber < numOfPages ? (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            onClick={() => setPageNumber(pageNumber + 1)}
          >
            Next <ChevronRightIcon />
          </Button>
        ) : (
          <div style={{ width: '78px', height: '30px' }} />
        )}
      </Box>
    </>
  );
};

export default DatasetTableWithTemplate;
