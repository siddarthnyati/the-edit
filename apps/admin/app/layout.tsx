import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'the-edit · admin',
  description: 'Magazine Weekly variant picker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: '#0a0a0a',
          color: '#f4f1ea',
          margin: 0,
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid #222',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <h1 style={{ margin: 0, fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: 28 }}>the edit. admin.</h1>
          <nav style={{ fontSize: 13, color: '#888' }}>
            <a href="/" style={{ color: '#f4f1ea', textDecoration: 'none', marginRight: 24 }}>runs</a>
          </nav>
        </header>
        <main style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
