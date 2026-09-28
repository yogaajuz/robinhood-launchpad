<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Only POST requests allowed']);
    exit;
}

if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'error' => 'No file uploaded or upload error']);
    exit;
}

$file = $_FILES['logo'];
$maxSize = 5 * 1024 * 1024; // 5MB max
if ($file['size'] > $maxSize) {
    echo json_encode(['success' => false, 'error' => 'File size exceeds 5MB']);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowedTypes = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/jpg' => 'jpg',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/svg+xml' => 'svg'
];

if (!isset($allowedTypes[$mime])) {
    echo json_encode(['success' => false, 'error' => 'Invalid image format. Allowed: PNG, JPG, WebP, GIF, SVG']);
    exit;
}

$ext = $allowedTypes[$mime];
$targetDir = __DIR__ . '/uploads';
if (!is_dir($targetDir)) {
    mkdir($targetDir, 0755, true);
}

$safeTicker = isset($_POST['ticker']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', strtolower($_POST['ticker'])) : 'coin';
$filename = 'logo_' . ($safeTicker ? $safeTicker . '_' : '') . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$targetPath = $targetDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode(['success' => false, 'error' => 'Failed to save local file']);
    exit;
}

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)) ? "https://" : "http://";
$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$localUrl = $host ? ($protocol . $host . '/uploads/' . $filename) : ('/uploads/' . $filename);

// --- Optional: Auto-Pin to Decentralized IPFS via Pinata ---
// To enable permanent IPFS pinning, paste your Pinata JWT here or set the PINATA_JWT environment variable.
// Free Pinata signup at: https://app.pinata.cloud
$pinataJwt = getenv('PINATA_JWT') ?: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI4ZGYxMDkyNC1jYTg4LTQ3MzUtYmQyZi1jMDI5NjI5ZTczMWMiLCJlbWFpbCI6ImFuYW5kYXlvZ2E5ODg4QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJlMjgyMTc3NDRlOGRjNzY4NWYzNCIsInNjb3BlZEtleVNlY3JldCI6IjY4YWYzZmQ3OTE0Yzc2YmQ5N2Y3YmQ0NTUwNjRlZDg3MTI4OGQyODg2OGQzMTU2NjdhYzgwNmUxMTEzNmRlZWMiLCJleHAiOjE4MjIxMDE0MzR9.DmREDFoppa3zfDKecrQ0lq7rhNlBi8A1UgnDtNgeafg';

$ipfsHash = null;
$ipfsGatewayUrl = null;

if (!empty($pinataJwt) && function_exists('curl_init')) {
    $ch = curl_init();
    $cfile = new CURLFile($targetPath, $mime, $filename);
    $postData = [
        'file' => $cfile,
        'pinataMetadata' => json_encode([
            'name' => $filename,
            'keyvalues' => ['ticker' => $safeTicker, 'platform' => 'robinhood-launchpad']
        ]),
        'pinataOptions' => json_encode(['cidVersion' => 1])
    ];

    curl_setopt($ch, CURLOPT_URL, 'https://api.pinata.cloud/pinning/pinFileToIPFS');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $pinataJwt
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $json = json_decode($response, true);
        if (isset($json['IpfsHash'])) {
            $ipfsHash = $json['IpfsHash'];
            $ipfsGatewayUrl = 'https://gateway.pinata.cloud/ipfs/' . $ipfsHash;
        }
    }
}

// If IPFS upload succeeded, use the decentralized IPFS URL as primary; otherwise use local cPanel URL
$primaryUrl = $ipfsGatewayUrl ? $ipfsGatewayUrl : $localUrl;

echo json_encode([
    'success' => true,
    'logoUrl' => $primaryUrl,
    'storage' => $ipfsGatewayUrl ? 'ipfs' : 'local',
    'ipfsHash' => $ipfsHash,
    'ipfsUrl' => $ipfsGatewayUrl,
    'localUrl' => $localUrl,
    'relativePath' => '/uploads/' . $filename,
    'filename' => $filename
]);
