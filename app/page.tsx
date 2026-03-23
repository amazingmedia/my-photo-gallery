'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { CloseIcon, DeleteIcon, ShareIcon, HeartIcon } from '@/components/GalleryIcons';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Photo = {
  id: string;
  photo_url: string;
  view_url?: string; 
  created_at: string;
  media_type: string;
};

export default function Home() {
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setSessionToken(session.access_token);
      }
    };
    checkUser();
  }, [router]);

  useEffect(() => {
    if (sessionToken) {
      fetchPhotos();
    }
  }, [sessionToken]);

  const fetchPhotos = async () => {
    if (!sessionToken) return;
    setIsLoadingGallery(true);
    
    try {
      const response = await fetch('/api/photos', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch photos');
      
      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error("ပုံဆွဲထုတ်ရာတွင် Error ဖြစ်နေပါသည်:", error);
    } finally {
      setIsLoadingGallery(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesToUpload = Array.from(e.target.files);
      await processUpload(filesToUpload);
    }
    e.target.value = '';
  };

  const processUpload = async (files: File[]) => {
    if (!sessionToken) return;
    setIsUploading(true);
    setStatusText('ပုံများ စတင် Upload တင်နေပါသည်...');

    try {
      const fileInfo = files.map(f => ({ name: f.name, type: f.type || 'application/octet-stream' }));
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({ files: fileInfo }),
      });
      
      if (!response.ok) throw new Error('API Check failure');
      
      const { tickets } = await response.json();
      const uploadedData = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ticket = tickets[i];

        // ပြင်ဆင်ချက် - Upload ကျရှုံးပါက ဆက်မလုပ်ဘဲ Error အတိအကျ ပြပေးမည့်စနစ်
        const putResponse = await fetch(ticket.uploadUrl, { 
          method: 'PUT', 
          headers: { 'Content-Type': file.type || 'application/octet-stream' }, 
          body: file 
        });

        if (!putResponse.ok) {
          const errorText = await putResponse.text();
          console.error("Backblaze Error Details:", errorText);
          throw new Error(`Upload Failed: ${putResponse.status}. Backblaze rejected the file.`);
        }

        const publicUrl = `https://mmhdmovie.s3.us-east-005.backblazeb2.com/${ticket.fileKey}`;
        uploadedData.push({ photo_url: publicUrl, account_id: ticket.accountId, media_type: file.type || 'image/jpeg' });
      }

      setStatusText('Database ထဲသို့ မှတ်တမ်းတင်နေပါသည်...');
      const { error } = await supabase.from('photos').insert(uploadedData);
      if (error) throw new Error('Database Insert Failed');

      setStatusText('အောင်မြင်စွာ တင်ပြီးပါပြီ! 🎉');
      fetchPhotos(); 
      
    } catch (error: any) {
      console.error("Upload Catch Error:", error);
      // ပြင်ဆင်ချက် - Error တက်ပါက အနီရောင်စာသားဖြင့် အတိအကျ ဖော်ပြပေးမည်
      setStatusText(`❌ Error: ${error.message}`);
    } finally {
      setIsUploading(false);
      // Error ဖြစ်ရင် စာသားကို ချက်ချင်းမဖျောက်ဘဲ အချိန်ပိုပေးထားမည်
      setTimeout(() => setStatusText(''), 6000); 
    }
  };

  const navigatePhoto = useCallback((direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null) return;
    
    let nextIndex = direction === 'next' ? selectedPhotoIndex + 1 : selectedPhotoIndex - 1;
    
    if (nextIndex >= photos.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = photos.length - 1;
    
    setSelectedPhotoIndex(nextIndex);
  }, [selectedPhotoIndex, photos.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPhotoIndex === null) return;
      if (e.key === 'ArrowRight') navigatePhoto('next');
      if (e.key === 'ArrowLeft') navigatePhoto('prev');
      if (e.key === 'Escape') setSelectedPhotoIndex(null); 
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex, navigatePhoto]);

  const handleDeletePhoto = async () => {
    if (selectedPhotoIndex === null || !sessionToken || !confirm('ဒီပုံကို အပြီးဖျက်မှာ သေချာပါသလား?')) return;
    
    setIsDeleting(true);
    const photoToDelete = photos[selectedPhotoIndex];
    // လင့်ခ်အဆုံးပိုင်းရှိ ဖိုင်နာမည်ကို အတိအကျ ဖြတ်ယူခြင်း
    const fileKey = photoToDelete.photo_url.split('/').pop()?.split('?')[0];

    try {
      const response = await fetch('/api/photos/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({ photoId: photoToDelete.id, fileKey: fileKey }),
      });
      
      if (!response.ok) throw new Error('Delete API failed');

      const updatedPhotos = photos.filter(p => p.id !== photoToDelete.id);
      setPhotos(updatedPhotos);
      
      if (updatedPhotos.length === 0) {
        setSelectedPhotoIndex(null);
      } else {
        setSelectedPhotoIndex(Math.min(selectedPhotoIndex, updatedPhotos.length - 1));
      }

    } catch (error) {
      console.error(error);
      alert('ပုံဖျက်ရာတွင် အခက်အခဲဖြစ်ပေါ်ခဲ့ပါသည်။');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShare = async () => {
    if (selectedPhotoIndex === null) return;
    const photo = photos[selectedPhotoIndex];
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out this memory',
          url: photo.view_url || photo.photo_url
        });
      } catch (error) {
        console.log('Share error:', error);
      }
    } else {
      navigator.clipboard.writeText(photo.view_url || photo.photo_url);
      alert('Link copied to clipboard!');
    }
  };

  if (!sessionToken) return null; 

  return (
    <main className="min-h-screen p-0 m-0 bg-white text-gray-900 font-sans">
      
      <div className="bg-white/95 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-100 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-gray-950 tracking-tighter">My Photos</h1>
          <div className="flex items-center gap-3">
            <input 
              type="file" multiple accept="image/*, video/*" onChange={handleFileChange}
              id="fileInput"
              className="hidden"
              disabled={isUploading}
            />
            <label htmlFor="fileInput" className={`font-bold px-4 py-2 rounded-lg text-sm transition-colors ${isUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100'}`}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </label>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-700 font-medium">
              Logout
            </button>
          </div>
        </div>
        {/* Error ပေါ်လာပါက အနီရောင်ဖြင့် ပြသရန် ပြင်ဆင်ထားသည် */}
        {statusText && (
          <p className={`mt-3 text-sm text-center font-medium p-2 rounded-lg animate-pulse ${statusText.includes('Error') ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50/50'}`}>
            {statusText}
          </p>
        )}
      </div>

      <div className="max-w-7xl mx-auto p-2 md:p-4">
        
        {isLoadingGallery ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
            <p className="text-gray-500">No photos yet. Start by uploading one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1 md:gap-2">
            {photos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer"
                onClick={() => setSelectedPhotoIndex(index)} 
              >
                {photo.media_type?.includes('video') ? (
                  <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                    <video src={photo.view_url || photo.photo_url} className="w-full h-full object-cover" />
                    <div className="absolute top-2 right-2 p-1.5 bg-black/40 rounded-full text-white text-xs">📹</div>
                  </div>
                ) : (
                  <img 
                    src={photo.view_url || photo.photo_url} 
                    alt="Gallery item" 
                    className="w-full h-full object-cover" 
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedPhotoIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col transition-all duration-300">
          
          <div className="flex items-center justify-between p-4 bg-black/20 text-white">
            <button onClick={() => setSelectedPhotoIndex(null)} className="flex items-center gap-1.5 text-blue-400 font-medium">
              <CloseIcon className="w-5 h-5" /> Done
            </button>
            <p className="text-xs text-gray-400 font-mono">{selectedPhotoIndex + 1} / {photos.length}</p>
          </div>

          <div className="flex-grow relative flex items-center justify-center p-2 group">
            <button onClick={() => navigatePhoto('prev')} className="absolute left-4 z-10 p-3 bg-black/40 rounded-full text-white/50 group-hover:text-white group-hover:bg-black/80 hidden md:block transition-all">
              &larr;
            </button>
            
            <div className="max-w-full max-h-[80vh] flex items-center justify-center">
              {photos[selectedPhotoIndex].media_type?.includes('video') ? (
                <video src={photos[selectedPhotoIndex].view_url} controls className="w-full max-h-[80vh] object-contain" autoPlay />
              ) : (
                <img 
                  src={photos[selectedPhotoIndex].view_url} 
                  alt="Full view" 
                  className="max-w-full max-h-[80vh] object-contain transition-transform duration-300"
                />
              )}
            </div>

            <button onClick={() => navigatePhoto('next')} className="absolute right-4 z-10 p-3 bg-black/40 rounded-full text-white/50 group-hover:text-white group-hover:bg-black/80 hidden md:block transition-all">
              &rarr;
            </button>
          </div>

          <div className="bg-black/40 backdrop-blur-sm p-4 border-t border-gray-800 flex items-center justify-around text-blue-400">
            <button onClick={handleShare} className="hover:text-blue-200" title="Share Photo">
              <ShareIcon className="w-7 h-7" />
            </button>
            <button className="hover:text-blue-200" title="Favorite (Dummy)">
              <HeartIcon className="w-7 h-7" />
            </button>
            <button 
              onClick={handleDeletePhoto} 
              disabled={isDeleting}
              className={`hover:text-red-400 ${isDeleting ? 'text-gray-600 cursor-not-allowed' : 'text-blue-400'}`}
              title="Delete Photo"
            >
              {isDeleting ? '...' : <DeleteIcon className="w-7 h-7" />}
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
