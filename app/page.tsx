'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const router = useRouter();

  // Login ဝင်ထားခြင်း ရှိမရှိ စစ်ဆေးခြင်း
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login'); // မဝင်ထားရင် Login Page သို့ ပို့မည်
      } else {
        setSessionToken(session.access_token);
      }
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setSelectedFiles(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !sessionToken) return;
    setIsUploading(true);
    setStatusText('Upload Ticket များ တောင်းခံနေပါသည်...');

    try {
      const fileInfo = selectedFiles.map(f => ({ name: f.name, type: f.type }));
      
      // API ဆီသို့ Login Token ပါ တွဲပို့ပေးခြင်း (ဒါမှ API က လက်ခံမည်ဖြစ်သည်)
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({ files: fileInfo }),
      });
      
      if (!response.ok) throw new Error('API ချိတ်ဆက်မှု ကျရှုံးပါသည်');
      
      const { tickets } = await response.json();

      setStatusText('Backblaze B2 သို့ တိုက်ရိုက် တင်နေပါသည်...');
      const uploadedData = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const ticket = tickets[i];

        await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });

        const publicUrl = `https://f005.backblazeb2.com/file/mmhdmovie/${ticket.fileKey}`;
        uploadedData.push({ photo_url: publicUrl, account_id: ticket.accountId, media_type: ticket.mediaType });
      }

      setStatusText('Database ထဲသို့ သိမ်းဆည်းနေပါသည်...');
      const { error } = await supabase.from('photos').insert(uploadedData);

      if (error) throw error;

      setStatusText('အောင်မြင်စွာ တင်ပြီးပါပြီ!');
      setSelectedFiles([]); 
      
    } catch (error) {
      console.error(error);
      setStatusText('Upload တင်ရာတွင် အခက်အခဲဖြစ်ပေါ်ခဲ့ပါသည်။');
    } finally {
      setIsUploading(false);
    }
  };

  // စစ်ဆေးနေစဉ် အလွတ်ပြထားရန်
  if (!sessionToken) return null; 

  return (
    <main className="min-h-screen p-10 bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-md relative">
        <button onClick={handleLogout} className="absolute top-4 right-4 text-sm text-red-600 hover:underline">
          Logout
        </button>
        
        <h1 className="text-3xl font-bold mb-6">My Personal Gallery</h1>
        
        <input 
          type="file" multiple accept="image/*, video/*" onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
        />

        {selectedFiles.length > 0 && (
          <div className="mb-6">
            <ul className="text-xs text-gray-500 mb-4 h-32 overflow-y-auto bg-gray-50 p-2 rounded">
              {selectedFiles.map((file, idx) => (
                <li key={idx} className="truncate">{file.name}</li>
              ))}
            </ul>
            <button 
              onClick={handleUpload} disabled={isUploading}
              className={`w-full py-3 rounded-md font-bold text-white transition-colors ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isUploading ? 'Uploading...' : 'Upload တင်မည်'}
            </button>
          </div>
        )}

        {statusText && <p className="mt-4 text-center font-medium text-sm text-blue-800 bg-blue-50 p-3 rounded">{statusText}</p>}
      </div>
    </main>
  );
}
