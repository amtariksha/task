/**
 * Presigned URL API Route
 * 
 * Generates presigned URLs for direct client-side uploads to AWS S3.
 * This bypasses Vercel's 4.5MB serverless function limit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  s3Client,
  S3_BUCKET,
  isS3Configured,
  generateBugAttachmentKey,
  generateCommentAttachmentKey,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  getS3FileUrl,
  isValidFileType
} from '@/lib/s3Config'
import { getAuthUser } from '@/lib/auth-server'

/**
 * POST /api/upload/presigned-url
 * Generate presigned URLs for file uploads
 * 
 * Request body:
 * {
 *   files: Array<{ name: string, type: string, size: number }>
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   uploads: Array<{ 
 *     filename: string, 
 *     uploadUrl: string, 
 *     fileUrl: string,
 *     key: string 
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if S3 is configured
    if (!isS3Configured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'AWS S3 is not configured. Please add AWS credentials to environment variables.',
          missingConfig: true
        },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { files, uploadType = 'bug' } = body // uploadType: 'bug' or 'comment'

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      )
    }

    const uploads: Array<{
      filename: string
      uploadUrl: string
      fileUrl: string
      key: string
      error?: string
    }> = []

    const errors: string[] = []

    for (const file of files) {
      try {
        const { name, type, size } = file

        // Validate file type using both extension and MIME type
        if (!isValidFileType(name, type)) {
          errors.push(`${name}: Invalid file type. Supported: images, videos, documents (.md, .txt, .prd), code files (.js, .jsx, .ts, .tsx, .json, .sql)`)
          continue
        }

        // Validate file size
        if (size > MAX_FILE_SIZE) {
          errors.push(`${name}: File size exceeds 10MB limit.`)
          continue
        }

        // Generate S3 key based on upload type
        const key = uploadType === 'comment'
          ? generateCommentAttachmentKey(name)
          : generateBugAttachmentKey(name)

        // Create PutObject command
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          ContentType: type,
          // Optional: Add metadata
          Metadata: {
            uploadedBy: user.employeeId,
            uploadedAt: new Date().toISOString(),
            originalFilename: name
          }
        })

        // Generate presigned URL (valid for 5 minutes)
        const uploadUrl = await getSignedUrl(s3Client, command, { 
          expiresIn: 300 // 5 minutes
        })

        // Get the final file URL
        const fileUrl = getS3FileUrl(key)

        uploads.push({
          filename: name,
          uploadUrl,
          fileUrl,
          key
        })
      } catch (error) {
        console.error(`Error generating presigned URL for ${file.name}:`, error)
        errors.push(`${file.name}: Failed to generate upload URL`)
      }
    }

    if (uploads.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid files to upload',
          errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      uploads,
      errors: errors.length > 0 ? errors : undefined,
      message: `Generated ${uploads.length} presigned URL(s)`
    })
  } catch (error) {
    console.error('Presigned URL API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate presigned URLs'
      },
      { status: 500 }
    )
  }
}

