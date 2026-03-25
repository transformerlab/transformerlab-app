type ProviderWithAccelerators = {
  type?: string;
  config?: {
    supported_accelerators?: string[] | string;
  };
};

const normalizeAccelerators = (
  accelerators: string[] | string | undefined,
): string[] => {
  if (!accelerators) {
    return [];
  }

  if (Array.isArray(accelerators)) {
    return accelerators.map((acc) => String(acc).toLowerCase());
  }

  return String(accelerators)
    .split(',')
    .map((acc) => acc.trim().toLowerCase())
    .filter(Boolean);
};

const canonicalizeAccelerator = (raw: string): string => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'mps' || normalized === 'apple') {
    return 'applesilicon';
  }
  if (normalized === 'cuda') {
    return 'nvidia';
  }
  if (normalized === 'rocm') {
    return 'amd';
  }
  return normalized;
};

export const isProviderCompatibleWithAccelerators = (
  provider: ProviderWithAccelerators | undefined,
  taskSupportedAccelerators: string | string[] | undefined,
): boolean => {
  if (!taskSupportedAccelerators) {
    return true;
  }

  if (!provider) {
    return false;
  }

  const supported = normalizeAccelerators(
    provider.config?.supported_accelerators,
  );
  if (supported.length === 0) {
    // No provider declaration means don't block task selection here.
    return true;
  }

  const supportedCanonical = new Set(
    supported.map((accelerator) => canonicalizeAccelerator(accelerator)),
  );
  const requiredCanonical = normalizeAccelerators(
    taskSupportedAccelerators,
  ).map((accelerator) => canonicalizeAccelerator(accelerator));

  // Gallery templates can list multiple supported accelerators (OR semantics).
  return requiredCanonical.some((accelerator) =>
    supportedCanonical.has(accelerator),
  );
};
