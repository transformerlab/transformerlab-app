// Helper function to fetch task.json from any URL
export default async function fetchTaskJsonFromUrl(
  taskJsonUrl: string,
  experimentId: string,
): Promise<any | null> {
  try {
    // Check if this is a GitHub URL (blob, raw, or repo URL)
    if (isGitHubUrl(taskJsonUrl)) {
      // Use the backend endpoint which supports GitHub PAT and handles URL conversion
      const endpoint = chatAPI.Endpoints.Task.FetchTaskJson(
        experimentId,
        taskJsonUrl,
      );
      const response = await chatAPI.authenticatedFetch(endpoint, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          'Error fetching task.json from GitHub. Error: ',
          response.status,
          errorText,
        );
        return null;
      }

      const result = await response.json();
      if (result.status === 'success' && result.data) {
        return result.data;
      }
      return null;
    }

    // For non-GitHub URLs, use direct fetch
    // Try using authenticated fetch first (for authenticated endpoints)
    let response = await chatAPI.authenticatedFetch(taskJsonUrl, {
      method: 'GET',
    });

    // If authenticated fetch fails, try regular fetch (for public URLs)
    if (!response.ok) {
      response = await fetch(taskJsonUrl, {
        method: 'GET',
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Error fetching task.json from URL. Error: ',
        response.status,
        errorText,
      );
      return null;
    }

    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    console.error('Error fetching task.json from URL:', error);
    return null;
  }
}
