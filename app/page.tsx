'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase ချိတ်ဆက်ရန် (Frontend အတွက်)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setStatusText('Upload Ticket များ တောင်းခံနေပါသည်...');

    try {
      // ၁။ API ဆီမှ Pre-signed URLs လှမ်းတောင်းခြင်း
      const fileInfo = selectedFiles.map(f => ({ name: f.name, type: f.type }));
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileInfo }),
      });
      
      const { tickets } = await response.json();

      // ၂။ Backblaze B2 ဆီသို့ ဖိုင်များကို တိုက်ရိုက် Upload တင်ခြင်း
      setStatusText('Backblaze B2 သို့ တိုက်ရိုက် တင်နေပါသည်...');
      const uploadedData = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const ticket = tickets[i];

        await fetch(ticket.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        // Upload အောင်မြင်လျှင် Database တွင် မှတ်ရန် Data စုဆောင်းခြင်း
        // မှတ်ချက်- Bucket အမည်ကို 'mmhdmovie' ဟု အသုံးပြုထားသည်
        const publicUrl = `https://f005.backblazeb2.com/file/mmhdmovie/${ticket.fileKey}`;
        uploadedData.push({
          photo_url: publicUrl,
          account_id: ticket.accountId,
          media_type: ticket.mediaType
        });
      }

      // ၃။ Supabase Database ထဲသို့ လင့်ခ်များ မှတ်တမ်းတင်ခြင်း
      setStatusText('Database ထဲသို့ သိမ်းဆည်းနေပါသည်...');
      const { error } = await supabase.from('photos').insert(uploadedData);

      if (error) throw error;

      setStatusText('အောင်မြင်စွာ တင်ပြီးပါပြီ!');
      setSelectedFiles([]); // ဖိုင်ရွေးထားသည်များကို ပြန်ရှင်းမည်
      
    } catch (error) {
      console.error(error);
      setStatusText('Upload တင်ရာတွင် အခက်အခဲဖြစ်ပေါ်ခဲ့ပါသည်။');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen p-10 bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6">My Personal Gallery</h1>
        
        <input 
          type="file" 
          multiple 
          accept="image/*, video/*" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
        />

        {selectedFiles.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium mb-2">ရွေးချယ်ထားသော ဖိုင် ({selectedFiles.length}) ခု:</p>
            <ul className="text-xs text-gray-500 mb-4 h-32 overflow-y-auto bg-gray-50 p-2 rounded">
              {selectedFiles.map((file, idx) => (
                <li key={idx} className="truncate">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</li>
              ))}
            </ul>
            
            <button 
              onClick={handleUpload}
              disabled={isUploading}
              className={`w-full py-3 rounded-md font-bold text-white transition-colors ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isUploading ? 'Uploading...' : 'Upload တင်မည်'}
            </button>
          </div>
        )}

        {statusText && (
          <p className="mt-4 text-center font-medium text-sm text-blue-800 bg-blue-50 p-3 rounded">
            {statusText}
          </p>
        )}
      </div>
    </main>
  );
}
