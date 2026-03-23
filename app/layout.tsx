import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// အတည်ငြိမ်ဆုံးဖြစ်သည့် Inter Font ကို အသုံးပြုခြင်း
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'My Photo Gallery',
  description: 'Personal photo gallery using Backblaze B2 and Supabase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
