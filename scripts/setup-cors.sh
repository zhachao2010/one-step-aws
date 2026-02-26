#!/usr/bin/env bash
# Apply CORS configuration to an S3 bucket for the web-based downloader.
# Usage: ./setup-cors.sh <bucket-name>
#
# This enables the browser-based downloader at https://zhachao2010.github.io/one-step-aws/
# to make direct S3 requests using the AWS SDK for JavaScript.

set -euo pipefail

BUCKET="${1:?Usage: $0 <bucket-name>}"

CORS_CONFIG=$(cat <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://zhachao2010.github.io"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["Content-Length", "ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF
)

echo "Applying CORS to bucket: ${BUCKET}"
echo "${CORS_CONFIG}" | aws s3api put-bucket-cors \
  --bucket "${BUCKET}" \
  --cors-configuration file:///dev/stdin

echo "Done. Verifying..."
aws s3api get-bucket-cors --bucket "${BUCKET}"
