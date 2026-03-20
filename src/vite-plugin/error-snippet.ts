/**
 * Client-side snippet injected during development that forwards
 * worker errors to the Vite error overlay via HMR.
 *
 * Note: This is injected as `children` of a `<script type="module">` tag
 * by the Vite `transformIndexHtml` hook — do NOT wrap in `<script>` tags.
 */
export const workerErrorSnippet = `
if (import.meta.hot) {
  const origOnerror = self.onerror;
  self.onerror = function(message, source, lineno, colno, error) {
    if (source && source.includes('worker')) {
      import.meta.hot.send('async-dom:error', {
        message: error ? error.message : String(message),
        stack: error ? error.stack : '',
        source: source,
        lineno: lineno,
        colno: colno,
      });
    }
    if (origOnerror) return origOnerror.call(this, message, source, lineno, colno, error);
  };
}
`;
