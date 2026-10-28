import type { MetadataRoute } from 'next';

/**
 * Lets the site be installed as an app (home screen on phones, its own window
 * on desktop). It opens at /login, which sends anyone already signed in
 * straight on to their dashboard or portal.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jay Capital Funding',
    short_name: 'Jay Capital',
    description: 'Your Jay Capital loan portal.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#04162A',
    theme_color: '#04162A',
    // Desktop icons are renamed (not overwritten) whenever they change: browsers
    // keep the old picture under the old address, even after a reinstall.
    icons: [
      { src: '/icons/app-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
