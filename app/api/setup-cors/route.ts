import { NextResponse } from 'next/server';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Database ထဲက Key များကို ဆွဲထုတ်ခြင်း
    const { data: accounts } = await supabase.from('storage_accounts').select('*').eq('status', 'Active').limit(1);
    
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'Active Account မရှိပါ' }, { status: 400 });
    }
    
    const account = accounts[0];

    const s3 = new S3Client({
      endpoint: account.endpoint_url,
      region: 'us-east-005',
      credentials: {
        accessKeyId: account.access_key,
        secretAccessKey: account.secret_key,
      },
    });

    // S3 Standard အတိုင်း CORS အတိအကျ သတ်မှတ်ပေးခြင်း
    const command = new PutBucketCorsCommand({
      Bucket: 'mmhdmovie', // သင့်ရဲ့ Bucket နာမည်
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'], // မည်သည့် Header မဆို လက်ခံမည် (အရေးကြီးဆုံး)
            AllowedMethods: ['PUT', 'POST', 'GET', 'HEAD', 'DELETE'],
            AllowedOrigins: ['*'], // နေရာစုံမှ လက်ခံမည်
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });

    await s3.send(command);
    return NextResponse.json({ message: 'CORS ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ! ယခု ပုံစတင် Upload လုပ်နိုင်ပါပြီ။' });

  } catch (error: any) {
    console.error('CORS Error:', error);
    return NextResponse.json({ error: 'CORS ပြင်ဆင်မှု ကျရှုံးပါသည်', details: error.message }, { status: 500 });
  }
}
