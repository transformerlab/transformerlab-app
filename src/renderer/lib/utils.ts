/* eslint-disable import/prefer-default-export */

import { useEffect, useRef } from 'react';

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

function capFirst(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function generateFriendlyName() {
  console.log('Generating friendly name');
  const adjectives = [
    'adorable',
    'beautiful',
    'clean',
    'drab',
    'elegant',
    'fancy',
    'glamorous',
    'handsome',
    'long',
    'magnificent',
    'old-fashioned',
    'plain',
    'quaint',
    'sparkling',
    'ugliest',
    'unsightly',
    'angry',
    'bewildered',
    'clumsy',
    'defeated',
    'embarrassed',
    'fierce',
    'grumpy',
    'helpless',
    'itchy',
    'jealous',
    'lazy',
    'mysterious',
    'nervous',
    'obnoxious',
    'panicky',
    'repulsive',
    'scary',
    'thoughtless',
    'uptight',
    'worried',
  ];
  const animals = [
    'aardvark',
    'alligator',
    'alpaca',
    'antelope',
    'baboon',
    'badger',
    'bat',
    'bear',
    'beaver',
    'buffalo',
    'camel',
    'cheetah',
    'chimpanzee',
    'chinchilla',
    'chipmunk',
    'cougar',
    'cow',
    'coyote',
    'crocodile',
    'crow',
    'deer',
    'dingo',
    'dog',
    'donkey',
    'elephant',
    'elk',
    'ferret',
    'fox',
    'frog',
    'gazelle',
    'giraffe',
    'gopher',
    'grizzly',
    'hedgehog',
    'hippopotamus',
    'hyena',
    'ibex',
    'iguana',
    'impala',
    'jackal',
    'jaguar',
    'kangaroo',
    'koala',
    'lemur',
    'leopard',
    'lion',
    'llama',
    'lynx',
    'meerkat',
    'mink',
    'monkey',
    'moose',
    'narwhal',
    'nyala',
    'ocelot',
    'opossum',
    'otter',
    'ox',
    'panda',
    'panther',
    'porcupine',
    'puma',
    'rabbit',
    'raccoon',
    'ram',
  ];

  const name =
    capFirst(adjectives[Math.floor(Math.random() * adjectives.length)]) +
    capFirst(animals[Math.floor(Math.random() * animals.length)]);
  return name;
}

export function useTraceUpdate(props) {
  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps, [k, v]) => {
      if (prev.current[k] !== v) {
        ps[k] = [prev.current[k], v];
      }
      return ps;
    }, {});
    if (Object.keys(changedProps).length > 0) {
      console.log('Changed props:', changedProps);
    }
    prev.current = props;
  });
}
