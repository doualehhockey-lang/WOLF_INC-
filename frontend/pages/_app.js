// frontend/pages/_app.js — Next.js app entry point.
// Wraps every page with the ThemeProvider (dark mode context).

import { ThemeProvider } from '../lib/theme.js';
import '../styles/globals.css';

/**
 * @param {{ Component: React.ComponentType, pageProps: object }} props
 */
export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
