import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Scripto',
    short_name: 'Scripto',
    description: 'AI-powered study assistant',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#09090b',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}