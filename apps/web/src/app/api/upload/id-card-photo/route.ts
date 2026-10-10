/**
 * ID Card Photo Upload API Route
 * 
 * Generates presigned URLs for uploading employee ID card photos to AWS S3.
 * Also updates the user's id_card_photo field in the database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { 
  s3Client, 
  S3_BUCKET, 
  isS3Configured, 
  generateIdCardPhotoKey,
  getS3FileUrl
} from '@/lib/s3Config'
import { getAuthUser } from '@/lib/auth-server'
import { updateUser } from '@/lib/db/users'

// Allowed file types for ID card photos (images only)
const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]

// Maximum file size (5MB for ID cards)
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * POST /api/upload/id-card-photo
 * Generate presigned URL for ID card photo upload
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

    const body = await request.json()
    const { filename, fileType, fileSize } = body

    if (!filename || !fileType || !fileSize) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: filename, fileType, fileSize' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only images (PNG, JPG, JPEG, WEBP) are allowed.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      )
    }

    // Generate S3 key
    const key = generateIdCardPhotoKey(user.employeeId, filename)

    // Create PutObject command
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: fileType,
      Metadata: {
        uploadedBy: user.employeeId,
        uploadedAt: new Date().toISOString(),
        originalFilename: filename,
        purpose: 'id-card-photo'
      }
    })

    // Generate presigned URL (valid for 5 minutes)
    const uploadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 300 // 5 minutes
    })

    // Get the final file URL
    const fileUrl = getS3FileUrl(key)

    return NextResponse.json({
      success: true,
      uploadUrl,
      fileUrl,
      key,
      message: 'Presigned URL generated successfully'
    })
  } catch (error) {
    console.error('Error generating presigned URL for ID card photo:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate upload URL'
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/upload/id-card-photo
 * Update user's id_card_photo field after successful upload
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { fileUrl } = body

    if (!fileUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing fileUrl' },
        { status: 400 }
      )
    }

    // Update user's id_card_photo field
    await updateUser(user.employeeId, { idCardPhoto: fileUrl })

    return NextResponse.json({
      success: true,
      message: 'ID card photo updated successfully',
      fileUrl
    })
  } catch (error) {
    console.error('Error updating ID card photo:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update ID card photo'
      },
      { status: 500 }
    )
  }
}

