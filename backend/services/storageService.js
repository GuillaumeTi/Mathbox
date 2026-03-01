/**
 * MathBox - Storage Service (MOCKED for MVP)
 * 
 * This service contains the full code structure for:
 * - File upload to AWS S3
 * - Signed URL generation for downloads
 * - File deletion
 * 
 * S3 calls are COMMENTED OUT. Local filesystem is used instead.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Robust UPLOAD_DIR resolution relative to backend root
const backendRoot = path.resolve(__dirname, '..'); // services/.. -> backend/
let uploadDir = process.env.UPLOAD_DIR || 'uploads';

if (!path.isAbsolute(uploadDir)) {
  uploadDir = path.join(backendRoot, uploadDir);
}
const UPLOAD_DIR = uploadDir;
console.log(`[Storage Service] UPLOAD_DIR resolved to: ${UPLOAD_DIR}`);

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/*
// ============ REAL S3 IMPLEMENTATION (uncomment when AWS keys available) ============
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: s3GetSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET || 'mathbox-storage';
// ============ END REAL S3 SETUP ============
*/

/**
 * Upload a file
 * @param {Buffer} fileBuffer - File data
 * @param {string} targetPath - Target path (e.g., "prof_id/student_id/date/file.pdf")
 * @param {string} mimeType - MIME type of the file
 * @returns {Object} Upload result with URL
 */
async function uploadFile(fileBuffer, targetPath, mimeType = 'application/octet-stream') {
  /*
  // ============ REAL S3 IMPLEMENTATION ============
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: targetPath,
    Body: fileBuffer,
    ContentType: mimeType,
  });
  
  await s3.send(command);
  
  return {
    success: true,
    url: `s3://${BUCKET}/${targetPath}`,
    key: targetPath,
  };
  // ============ END REAL S3 IMPLEMENTATION ============
  */

  // ============ MOCK: Local filesystem ============
  const fullPath = path.join(UPLOAD_DIR, targetPath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, fileBuffer);
  console.log(`[Storage Mock] File saved: ${fullPath} (${fileBuffer.length} bytes)`);

  return {
    success: true,
    url: `/uploads/${targetPath}`,
    key: targetPath,
    size: fileBuffer.length,
  };
  // ============ END MOCK ============
}

/**
 * Get a signed/download URL for a file
 * @param {string} filePath - The file key/path
 * @returns {Object} Result with signed URL
 */
async function getSignedUrl(filePath) {
  /*
  // ============ REAL S3 IMPLEMENTATION ============
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: filePath,
  });
 
  const signedUrl = await s3GetSignedUrl(s3, command, { expiresIn: 3600 });
 
  return {
    success: true,
    url: signedUrl,
    expiresIn: 3600,
  };
  // ============ END REAL S3 IMPLEMENTATION ============
  */

  // ============ MOCK: Local path ============
  const localUrl = `/uploads/${filePath}`;
  const fullPath = path.join(UPLOAD_DIR, filePath);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: 'File not found' };
  }

  return {
    success: true,
    url: localUrl,
    expiresIn: null, // No expiration for local files
  };
  // ============ END MOCK ============
}

/**
 * Delete a file
 * @param {string} filePath - The file key/path
 * @returns {Object} Deletion result
 */
async function deleteFile(filePath) {
  /*
  // ============ REAL S3 IMPLEMENTATION ============
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: filePath,
  });
 
  await s3.send(command);
  return { success: true };
  // ============ END REAL S3 IMPLEMENTATION ============
  */

  // ============ MOCK: Local deletion ============
  const fullPath = path.join(UPLOAD_DIR, filePath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`[Storage Mock] File deleted: ${fullPath}`);
  }

  return { success: true };
  // ============ END MOCK ============
}

module.exports = { uploadFile, getSignedUrl, deleteFile };
