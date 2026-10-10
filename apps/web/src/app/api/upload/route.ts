/**
 * File Upload API Route
 * Handles direct file uploads to AWS S3 for bug attachments and feed posts
 *
 * NOTE: This endpoint uploads files directly to S3 (not local filesystem).
 * For presigned URLs (client-side uploads), use /api/upload/presigned-url instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import {
  s3Client,
  S3_BUCKET,
  isS3Configured,
  generateBugAttachmentKey,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  getS3FileUrl,
  isValidFileType
} from '@/lib/s3Config'
import { getAuthUser } from '@/lib/auth-server'

/**
 * POST /api/upload
 * Upload one or more files directly to AWS S3
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
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

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No files provided'
        },
        { status: 400 }
      )
    }

    const uploadedFiles: string[] = []
    const errors: string[] = []

    for (const file of files) {
      try {
        // Validate file type using both extension and MIME type
        if (!isValidFileType(file.name, file.type)) {
          errors.push(`${file.name}: Invalid file type. Supported: images, videos, documents (.md, .txt, .prd), code files (.js, .jsx, .ts, .tsx, .json, .sql)`)
          continue
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: File size exceeds 10MB limit.`)
          continue
        }

        // Generate S3 key
        const key = generateBugAttachmentKey(file.name)

        // Convert file to buffer
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Upload to S3
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          Metadata: {
            uploadedBy: user.employeeId,
            uploadedAt: new Date().toISOString(),
            originalFilename: file.name
          }
        })

        await s3Client.send(command)

        // Get S3 file URL
        const fileUrl = getS3FileUrl(key)
        uploadedFiles.push(fileUrl)
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error)
        errors.push(`${file.name}: Upload failed`)
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No files were uploaded successfully',
          errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully uploaded ${uploadedFiles.length} file(s) to S3`
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload files'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/upload
 * Get upload configuration
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    config: {
      maxFileSize: MAX_FILE_SIZE,
      maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
      allowedTypes: ALLOWED_FILE_TYPES,
      uploadMethod: 'S3 Direct Upload',
      s3Configured: isS3Configured()
    }
  })
}

