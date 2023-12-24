import createCache from '@emotion/cache';

const isBrowser = typeof window !== 'undefined';

export default function createEmotionCache() {
  let insertionPoint: HTMLElement;

  if (isBrowser) {
    const emotionInsertionPoint = document.querySelector(
      `meta[name="emotion-insertion-point"]`
    ) as HTMLElement;
    insertionPoint = emotionInsertionPoint ?? undefined;
  }

  return createCache({
    key: 'mui-style',
    insertionPoint,
  });
}
