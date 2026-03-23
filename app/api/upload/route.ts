import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

// Supabase ချိတ်ဆက်ရန်
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { files } = await request.json(); // ဖိုင်နာမည်များ လက်ခံရယူခြင်း

    // ၁။ Supabase ကနေ Active ဖြစ်နေတဲ့ B2 Key ကို လှမ်းယူခြင်း
    const { data: accounts, error } = await supabase
      .from('storage_accounts')
      .select('*')
      .eq('status', 'Active')
      .limit(1);

    if (error || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'Active Account မရှိပါ' }, { status: 500 });
    }

    const account = accounts[0];

    // ၂။ Backblaze B2 (S3 Client) ကို ချိတ်ဆက်ခြင်း
    const s3 = new S3Client({
      endpoint: account.endpoint_url, // ဥပမာ - https://s3.us-east-005.backblazeb2.com
      region: 'us-east-005', 
      credentials: {
        accessKeyId: account.access_key,
        secretAccessKey: account.secret_key,
      },
    });

    // ၃။ ဖိုင်တစ်ခုချင်းစီအတွက် Upload တင်မည့် လင့်ခ် (Pre-signed URL) များ ဖန်တီးခြင်း
    const uploadTickets = await Promise.all(
      files.map(async (file: { name: string, type: string }) => {
        // ဖိုင်နာမည် မထပ်အောင် အချိန်ဂဏန်းလေးတွေ ထည့်ပေးခြင်း
        const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        
        const command = new PutObjectCommand({
          Bucket: 'mmhdmovie', // သင့်ရဲ့ Bucket နာမည်
          Key: uniqueFileName,
          ContentType: file.type, // image/jpeg သို့မဟုတ် video/mp4
        });

        // တစ်နာရီ (၃၆၀၀ စက္ကန့်) သက်တမ်းရှိသော လင့်ခ်ထုတ်ပေးခြင်း
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        return {
          originalName: file.name,
          uploadUrl: signedUrl,
          fileKey: uniqueFileName,
          accountId: account.id,
          mediaType: file.type
        };
      })
    );

    return NextResponse.json({ tickets: uploadTickets });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
