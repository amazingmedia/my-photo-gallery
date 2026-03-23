import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });

    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (photosError) throw photosError;
    if (!photos || photos.length === 0) return NextResponse.json({ photos: [] });

    const { data: accounts } = await supabase.from('storage_accounts').select('*').eq('status', 'Active').limit(1);
    if (!accounts || accounts.length === 0) throw new Error('Active Account မရှိပါ');
    const account = accounts[0];

    const s3 = new S3Client({
      endpoint: account.endpoint_url,
      region: 'us-east-005',
      credentials: {
        accessKeyId: account.access_key,
        secretAccessKey: account.secret_key,
      },
    });

    const photosWithSignedUrls = await Promise.all(
      photos.map(async (photo) => {
        try {
            // URL မှ File Key ကို အတိအကျ ဖြတ်ယူပြီး Decode လုပ်ခြင်း
            const rawKey = photo.photo_url.split('/').pop()?.split('?')[0] || '';
            const fileKey = decodeURIComponent(rawKey);

            const command = new GetObjectCommand({
              Bucket: 'mmhdmovie', // သင့် Bucket နာမည်
              Key: fileKey,
            });

            // ၁ နာရီခံမည့် ကြည့်ခွင့်လက်မှတ် ထုတ်ပေးခြင်း
            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            
            return {
              ...photo,
              view_url: signedUrl 
            };
        } catch (err) {
            console.error("Presigned URL Error for photo ID:", photo.id, err);
            return photo; 
        }
      })
    );

    return NextResponse.json({ photos: photosWithSignedUrls });

  } catch (error: any) {
    console.error('Photos Fetch Error:', error);
    return NextResponse.json({ error: 'Server Error', details: error.message }, { status: 500 });
  }
}
