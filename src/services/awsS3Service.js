import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import config from "../config/env.js";

// Configura AWS SDK v3
const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
});

// Sube la imagen a S3 y retorna la URL pública
export const uploadToPublicStorage = async (buffer, mimeType = "image/jpeg") => {
  const fileName = `comprobante_tienda/${uuidv4()}.jpg`;
  const params = {
    Bucket: config.AWS_BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  };

  await s3.send(new PutObjectCommand(params));

  // URL pública
  return `https://${config.AWS_BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com/${fileName}`;
};