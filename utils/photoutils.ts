
// Converts a File or Blob object to a base64 encoded string.
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // The result includes the data URI prefix (e.g., "data:image/jpeg;base64,"), 
      // which we need to remove before sending to the Gemini API.
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
