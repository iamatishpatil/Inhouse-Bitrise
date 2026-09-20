/**
 * Safe clipboard copy utility that works in both secure (HTTPS/localhost)
 * and non-secure (HTTP) browser contexts.
 *
 * @param {string} text - The text content to copy to the clipboard.
 * @returns {Promise<boolean>} Resolves to true if successfully copied, otherwise false.
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern clipboard copy failed, trying fallback...', err);
    }
  }

  // Fallback copy implementation for non-secure HTTP contexts
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Position out-of-screen and fixed so it doesn't cause page scrolling/reflows
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
    return false;
  }
}
