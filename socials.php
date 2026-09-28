<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}
$dataFile = $uploadsDir . '/socials.json';

// Helper: Read existing socials
function getSocialsData($file) {
    if (!file_exists($file)) {
        return [];
    }
    $content = file_get_contents($file);
    if (!$content) {
        return [];
    }
    $json = json_decode($content, true);
    return is_array($json) ? $json : [];
}

// Helper: Save socials
function saveSocialsData($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

// 1. GET: Retrieve all or specific token socials
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = getSocialsData($dataFile);
    $queryKey = isset($_GET['key']) ? strtolower(trim($_GET['key'])) : null;
    
    if ($queryKey) {
        $result = isset($data[$queryKey]) ? $data[$queryKey] : null;
        echo json_encode(['success' => true, 'socials' => $result]);
    } else {
        echo json_encode(['success' => true, 'allSocials' => $data]);
    }
    exit;
}

// 2. POST: Save / Update social links for a token
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true);

    if (!$body && !empty($_POST)) {
        $body = $_POST;
    }

    if (!$body) {
        echo json_encode(['success' => false, 'error' => 'Invalid JSON input']);
        exit;
    }

    $id = isset($body['id']) ? strtolower(trim($body['id'])) : null;
    $ticker = isset($body['ticker']) ? strtoupper(trim($body['ticker'])) : null;
    $address = isset($body['address']) ? strtolower(trim($body['address'])) : null;

    if (!$id && !$ticker && !$address) {
        echo json_encode(['success' => false, 'error' => 'Missing token identifier (id, ticker, or address)']);
        exit;
    }

    $entry = [
        'website' => isset($body['website']) ? trim($body['website']) : null,
        'twitter' => isset($body['twitter']) ? trim($body['twitter']) : null,
        'telegram' => isset($body['telegram']) ? trim($body['telegram']) : null,
        'youtube' => isset($body['youtube']) ? trim($body['youtube']) : null,
        'discord' => isset($body['discord']) ? trim($body['discord']) : null,
        'updatedAt' => time()
    ];

    $data = getSocialsData($dataFile);

    if ($id) $data[$id] = $entry;
    if ($address) $data[$address] = $entry;
    if ($ticker) $data[strtolower($ticker)] = $entry;

    saveSocialsData($dataFile, $data);

    echo json_encode(['success' => true, 'saved' => $entry]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Method not allowed']);
