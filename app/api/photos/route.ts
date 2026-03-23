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

    // ၁။ Token စစ်ဆေးခြင်း (Login ဝင်ထားသူသာ ကြည့်ခွင့်ရှိမည်)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });

    // ၂။ Photos များကို Database မှ ဆွဲထုတ်ခြင်း
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (photosError) throw photosError;
    if (!photos || photos.length === 0) return NextResponse.json({ photos: [] });

    // ၃။ Backblaze Key များကို ဆွဲထုတ်ခြင်း
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

    // ၄။ ပုံတစ်ပုံချင်းစီအတွက် Pre-signed URL (ကြည့်ခွင့်လက်မှတ်) များ ဖန်တီးခြင်း
    const photosWithSignedUrls = await Promise.all(
      photos.map(async (photo) => {
        // Database ထဲက URL ကနေ ဖိုင်နာမည်ကို ပြန်ဖြတ်ယူခြင်း
        const fileKey = photo.photo_url.split('/').pop();

        const command = new GetObjectCommand({
          Bucket: 'mmhdmovie', // သင့် Bucket နာမည်
          Key: fileKey,
        });

        // ၁ နာရီ သာ သက်တမ်းရှိမည့် Link အသစ် ဖန်တီးခြင်း (၁ နာရီကျော်ရင် ကြည့်မရတော့ပါ)
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        return {
          ...photo,
          view_url: signedUrl // Frontend တွင် ပြသရန် URL အသစ်
        };
      })
    );

    return NextResponse.json({ photos: photosWithSignedUrls });

  } catch (error: any) {
    console.error('Photos Fetch Error:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
