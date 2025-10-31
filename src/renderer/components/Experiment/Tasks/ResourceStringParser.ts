export interface ParsedResources {
  count?: number;
  cpus?: number;
  memory?: number;
  gpu?: string;
  disk?: number;
  instanceName?: string;
  formatted: string;
}

/**
 * Parses a resources string in the format: "1x(cpus=2, mem=4, cpu3c-2-4, disk=10)" or "1x(cpus=2, mem=4, gpu=T4, cpu3c-2-4, disk=10)"
 * @param resourcesStr - The resources string from the backend
 * @returns Parsed resources object with formatted display string
 */
export function parseResourcesString(resourcesStr: string): ParsedResources {
  if (!resourcesStr || typeof resourcesStr !== "string") {
    return { formatted: "-" };
  }

  try {
    // Extract the count and the resource specifications
    const match = resourcesStr.match(/^(\d+)x\((.+)\)$/);
    if (!match) {
      return { formatted: resourcesStr };
    }

    const count = parseInt(match[1], 10);
    const resourceSpecs = match[2];

    // Parse individual resource specifications
    const specs = resourceSpecs.split(",").map((s) => s.trim());
    const parsed: ParsedResources = { count, formatted: "" };

    for (const spec of specs) {
      if (spec.startsWith("cpus=")) {
        parsed.cpus = parseInt(spec.replace("cpus=", ""), 10);
      } else if (spec.startsWith("mem=")) {
        parsed.memory = parseInt(spec.replace("mem=", ""), 10);
      } else if (spec.startsWith("gpu=")) {
        parsed.gpu = spec.replace("gpu=", "");
      } else if (spec.startsWith("gpus=")) {
        parsed.gpu = spec.replace("gpus=", "");
      } else if (spec.startsWith("disk=")) {
        parsed.disk = parseInt(spec.replace("disk=", ""), 10);
      } else if (!spec.includes("=")) {
        // This is likely the instance name (e.g., "cpu3c-2-4")
        parsed.instanceName = spec;
      }
    }

    // Create a nicely formatted string
    const parts: string[] = [];

    if (count > 1) {
      parts.push(`${count}x`);
    }

    if (parsed.cpus) {
      parts.push(`${parsed.cpus} CPU${parsed.cpus > 1 ? "s" : ""}`);
    }

    if (parsed.memory) {
      parts.push(`${parsed.memory}GB RAM`);
    }

    if (parsed.gpu) {
      parts.push(`${parsed.gpu}`);
    }

    if (parsed.disk) {
      parts.push(`${parsed.disk}GB disk`);
    }

    parsed.formatted = parts.join(", ");

    return parsed;
  } catch (error) {
    console.error("Error parsing resources string:", error);
    return { formatted: resourcesStr };
  }
}

/**
 * Creates a compact display of resources for use in tables
 * @param resourcesStr - The resources string from the backend
 * @returns Compact formatted string
 */
export function formatResourcesCompact(resourcesStr: string): string {
  const parsed = parseResourcesString(resourcesStr);

  if (parsed.formatted === "-") {
    return "-";
  }

  // Create a more compact version for table display
  const parts: string[] = [];

  if (parsed.count && parsed.count > 1) {
    parts.push(`${parsed.count}x`);
  }

  if (parsed.cpus) {
    parts.push(`${parsed.cpus}c`);
  }

  if (parsed.memory) {
    parts.push(`${parsed.memory}g`);
  }

  if (parsed.gpu) {
    parts.push(parsed.gpu);
  }

  if (parsed.disk) {
    parts.push(`${parsed.disk}gb`);
  }

  return parts.join("/");
}
