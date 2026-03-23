'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

// Supabase ချိတ်ဆက်ခြင်း
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Photo အမျိုးအစား သတ်မှတ်ခြင်း
type Photo = {
  id: string;
  photo_url: string;
  created_at: string;
  media_type: string;
};

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  
  // Gallery အတွက် State များ
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  const router = useRouter();

  // ၁။ Login စစ်ဆေးခြင်း
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setSessionToken(session.access_token);
        fetchPhotos(); // Login ဝင်ထားရင် Database ထဲက ပုံတွေကို စတင်ဆွဲထုတ်မည်
      }
    };
    checkUser();
  }, [router]);

  // ၂။ Database ထဲမှ ပုံများကို အသစ်ဆုံး အရင်ပေါ်အောင် ဆွဲထုတ်ခြင်း
  const fetchPhotos = async () => {
    setIsLoadingGallery(true);
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false }); // အသစ်တင်ထားသောပုံ အပေါ်ဆုံးတွင်ပြရန်
      
    if (data) setPhotos(data);
    if (error) console.error("ပုံဆွဲထုတ်ရာတွင် Error ဖြစ်နေပါသည်:", error);
    setIsLoadingGallery(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setSelectedFiles(Array.from(e.target.files));
  };

  // ၃။ Upload တင်ခြင်း လုပ်ငန်းစဉ်
  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !sessionToken) return;
    setIsUploading(true);
    setStatusText('Upload Ticket များ တောင်းခံနေပါသည်...');

    try {
      const fileInfo = selectedFiles.map(f => ({ name: f.name, type: f.type }));
      
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

        // S3 Standard အတိုင်း Public URL ပြင်ဆင်ခြင်း
        const publicUrl = `https://mmhdmovie.s3.us-east-005.backblazeb2.com/${ticket.fileKey}`;
        
        uploadedData.push({ photo_url: publicUrl, account_id: ticket.accountId, media_type: ticket.mediaType });
      }

      setStatusText('Database ထဲသို့ သိမ်းဆည်းနေပါသည်...');
      const { error } = await supabase.from('photos').insert(uploadedData);

      if (error) throw error;

      setStatusText('အောင်မြင်စွာ တင်ပြီးပါပြီ!');
      setSelectedFiles([]); 
      fetchPhotos(); // ပုံတင်ပြီးတာနဲ့ Gallery ထဲသို့ အသစ်တင်လိုက်သောပုံ ချက်ချင်းဝင်လာစေရန်
      
    } catch (error) {
      console.error(error);
      setStatusText('Upload တင်ရာတွင် အခက်အခဲဖြစ်ပေါ်ခဲ့ပါသည်။');
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusText(''), 3000); // ၃ စက္ကန့်နေရင် Status စာသားကို ဖျောက်မည်
    }
  };

  if (!sessionToken) return null; 

  return (
    <main className="min-h-screen p-6 md:p-10 bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto">
        
        {/* Upload ဘောက်စ် အပိုင်း */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-gray-100 mb-8 relative">
          <button onClick={handleLogout} className="absolute top-6 right-6 text-sm text-red-600 hover:text-red-800 font-medium">
            Logout
          </button>
          
          <h1 className="text-3xl font-bold mb-2">My Personal Gallery</h1>
          <p className="text-gray-500 mb-6 text-sm">Upload and manage your memories securely.</p>
          
          <div className="max-w-xl">
            <input 
              type="file" multiple accept="image/*, video/*" onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 mb-4 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors"
            />

            {selectedFiles.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-500 mb-2">ရွေးချယ်ထားသော ဖိုင်များ ({selectedFiles.length})</p>
                <button 
                  onClick={handleUpload} disabled={isUploading}
                  className={`w-full py-3 rounded-lg font-bold text-white transition-all ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'}`}
                >
                  {isUploading ? 'Uploading...' : 'Upload တင်မည်'}
                </button>
              </div>
            )}

            {statusText && <p className="mt-3 text-sm font-medium text-blue-700 bg-blue-50/50 p-2 rounded-lg">{statusText}</p>}
          </div>
        </div>

        {/* Gallery ပြသသည့် အပိုင်း */}
        <div>
          <h2 className="text-xl font-bold mb-6 flex items-center">
            Gallery Photos 
            <span className="ml-3 bg-gray-200 text-gray-700 py-0.5 px-2.5 rounded-full text-sm">{photos.length}</span>
          </h2>
          
          {isLoadingGallery ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-100 border-dashed">
              <p className="text-gray-500">ပုံများ မရှိသေးပါ။ အပေါ်မှ Upload တင်နိုင်ပါသည်။</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                  {photo.media_type?.includes('video') ? (
                    <video src={photo.photo_url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img 
                      src={photo.photo_url} 
                      alt="Gallery item" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  )}
                  {/* Hover လုပ်မှ ပေါ်လာမည့် အမည်းရောင် အရိပ်လေး */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 pointer-events-none"></div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
