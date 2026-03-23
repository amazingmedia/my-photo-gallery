import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
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
          Bucket: 'mmhdmovie',
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
