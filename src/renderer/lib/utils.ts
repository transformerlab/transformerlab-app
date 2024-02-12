/* eslint-disable import/prefer-default-export */

/**
 * Give this function a number of bytes and it will return a human readable string
 * @param bytes number of Bytes
 * @param decimals decimals to show in output
 * @returns string with human readable bytes
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    'Bytes',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
    'EiB',
    'ZiB',
    'YiB',
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

export const modelTypes = [
  'All',
  'MLX',
  'GGUF',
  'LlamaForCausalLM',
  'MistralForCausalLM',
  'T5ForConditionalGeneration',
  'PhiForCausalLM',
  'GPTBigCodeForCausalLM',
];

export const licenseTypes = [
  'All',
  'MIT',
  'CC BY-SA-4.0',
  'Apache 2.0',
  'Meta Custom',
  'GPL',
];

export function filterByFilters(data, searchText = '', filters = {}) {
  return data.filter((row) => {
    if (row.name.toLowerCase().includes(searchText.toLowerCase())) {
      for (const filterKey in filters) {
        console.log(filterKey, filters[filterKey]);
        if (filters[filterKey] !== 'All') {
          if (row[filterKey] !== filters[filterKey]) {
            return false;
          }
        }
      }
      return true;
    }
    return false;
  });
}

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
