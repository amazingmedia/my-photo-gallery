import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

// Next.js ကို Build ချိန်တွင် ကြိုမဖတ်စေရန် (Error ကို တားဆီးရန်)
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // API ခေါ်မှသာ Supabase ကို ချိတ်ဆက်ပါမည် 
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
    
    // Key မရှိပါက Error အတိအကျ ပြပေးရန်
    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase Keys များ မရှိပါ။ Vercel တွင် စစ်ဆေးပါ။");
      return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ၁။ Login ဝင်ထားခြင်း ရှိမရှိ Token စစ်ဆေးခြင်း
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'အကောင့်ဝင်ထားရန် လိုအပ်ပါသည်' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Token မှားယွင်းနေပါသည်' }, { status: 401 });
    }

    // ၂။ Token မှန်ကန်မှသာ အောက်ပါ လုပ်ငန်းစဉ်များကို ဆက်လုပ်ခွင့်ပေးပါမည်
    const { files } = await request.json();

    const { data: accounts, error } = await supabase
      .from('storage_accounts')
      .select('*')
      .eq('status', 'Active')
      .limit(1);

    if (error || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'Active Account မရှိပါ' }, { status: 500 });
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

    const uploadTickets = await Promise.all(
      files.map(async (file: { name: string, type: string }) => {
        const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
        const command = new PutObjectCommand({
          Bucket: 'mmhdmovie', // သင့်ရဲ့ Bucket နာမည်
          Key: uniqueFileName,
          ContentType: file.type,
        });

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
