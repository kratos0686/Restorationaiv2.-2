/**
 * Uploads a large file to GCP in chunks using a Resumable Session URI.
 * @param {File|Blob} file - The image file to upload.
 * @param {string} sessionUri - The resumable upload session URI obtained from the backend.
 */
export async function uploadFileInChunks(file: File | Blob, sessionUri: string): Promise<boolean> {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  const totalSize = file.size;
  let startByte = 0;

  while (startByte < totalSize) {
    const endByte = Math.min(startByte + CHUNK_SIZE, totalSize);
    const chunk = file.slice(startByte, endByte);
    
    const headers = {
      'Content-Length': chunk.size.toString(),
      'Content-Range': `bytes ${startByte}-${endByte - 1}/${totalSize}`
    };

    try {
      const response = await fetch(sessionUri, {
        method: 'PUT',
        headers: headers,
        body: chunk
      });

      if (response.status === 200 || response.status === 201) {
        console.log("Upload fully complete.");
        return true;
      } else if (response.status === 308) { // Resume Incomplete
        // Parse the Range header to verify committed bytes
        const rangeHeader = response.headers.get('Range');
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=0-(\d+)/);
          if (match && match[1]) {
             startByte = parseInt(match[1], 10) + 1;
             continue;
          }
        }
        startByte = endByte; // Assume success if no range header on 308
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      console.error("Chunk upload failed, retrying...", error);
      // Implementation of exponential backoff logic would go here
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}
