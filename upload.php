<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
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

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)) ? "https://" : "http://";
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    $publicUrl = $host ? ($protocol . $host . '/uploads/' . $filename) : ('/uploads/' . $filename);
    echo json_encode([
        'success' => true,
        'logoUrl' => $publicUrl,
        'relativePath' => '/uploads/' . $filename,
        'filename' => $filename
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
}
