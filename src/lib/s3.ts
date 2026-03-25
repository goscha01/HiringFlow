import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.S3_BUCKET || 'hiringflow-uploads'
const REGION = process.env.S3_REGION || 'us-east-1'

function getS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(`S3 credentials not configured. AWS_ACCESS_KEY_ID: ${accessKeyId ? 'SET' : 'MISSING'}, AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? 'SET' : 'MISSING'}`)
  }

  return new S3Client({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export async function getUploadPresignedUrl(key: string, contentType: string): Promise<string> {
  const s3 = getS3Client()
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

export function getPublicUrl(key: string): string {
  if (process.env.CLOUDFRONT_DOMAIN) {
    return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`
  }
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

export { BUCKET, REGION }
