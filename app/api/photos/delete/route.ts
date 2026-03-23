import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// Secret Key ကိုသုံး၍ Supabase ချိတ်ဆက်ခြင်း
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    // ၁။ Token စစ်ဆေးခြင်း (Login ဝင်ထားသူသာ ဖျက်ခွင့်ရှိမည်)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });

    const { photoId, fileKey } = await request.json();

    if (!photoId || !fileKey) {
      return NextResponse.json({ error: 'Missing Required Info' }, { status: 400 });
    }

    // ၂။ Supabase Table ထဲမှ ဖျက်ခြင်း
    const { error: dbError } = await supabase
      .from('photos')
      .delete()
      .eq('id', photoId);

    if (dbError) throw dbError;

    // ၃။ Backblaze B2 (S3 API) ထဲမှ ဖျက်ခြင်း
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

    const deleteCommand = new DeleteObjectCommand({
      Bucket: 'mmhdmovie', // သင့် Bucket နာမည်
      Key: fileKey,
    });

    await s3.send(deleteCommand);

    return NextResponse.json({ message: 'အောင်မြင်စွာ ဖျက်ပြီးပါပြီ!' });

  } catch (error: any) {
    console.error('Delete API Error:', error);
    return NextResponse.json({ error: 'Server Error', details: error.message }, { status: 500 });
  }
}
