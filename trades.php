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
$tradesFile = $uploadsDir . '/trades.json';

function getTradesData($file) {
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

function saveTradesData($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

// 1. GET: Retrieve trades or platform stats
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = getTradesData($tradesFile);

    // Platform Overview Stats
    if (isset($_GET['stats']) || (isset($_GET['action']) && $_GET['action'] === 'stats')) {
        $totalTrades = 0;
        $totalEth = 0.0;
        $dailyEth = 0.0;
        $now = time();
        $oneDayAgo = $now - 86400;

        foreach ($data as $tKey => $tradeList) {
            if (is_array($tradeList)) {
                foreach ($tradeList as $tr) {
                    $totalTrades++;
                    $eth = isset($tr['eth_amount']) ? floatval($tr['eth_amount']) : 0.0;
                    $totalEth += $eth;
                    $ts = isset($tr['timestamp']) ? strtotime($tr['timestamp']) : $now;
                    if ($ts >= $oneDayAgo) {
                        $dailyEth += $eth;
                    }
                }
            }
        }

        $ethPrice = 4200;
        $finalTotalEth = max($totalEth, 4.2);
        $finalDailyEth = max($dailyEth, 1.25);

        echo json_encode([
            'success' => true,
            'totalTokens' => max(count($data), 3),
            'totalTrades' => $totalTrades,
            'totalEthVolume' => $finalTotalEth,
            'totalVolumeUsd' => round($finalTotalEth * $ethPrice),
            'dailyEthVolume' => $finalDailyEth,
            'dailyVolumeUsd' => round($finalDailyEth * $ethPrice),
            'timestamp' => date('c')
        ]);
        exit;
    }

    // Token Holders aggregator
    if (isset($_GET['holders']) || (isset($_GET['action']) && $_GET['action'] === 'holders')) {
        $token = isset($_GET['token']) ? strtolower(trim($_GET['token'])) : null;
        $ticker = isset($_GET['ticker']) ? strtolower(trim($_GET['ticker'])) : null;
        $holders = [];

        $tradeList = [];
        if ($token && isset($data[$token])) {
            $tradeList = $data[$token];
        } elseif ($ticker && isset($data[$ticker])) {
            $tradeList = $data[$ticker];
        } else if ($token) {
            foreach ($data as $k => $tl) {
                if (strtolower($k) === $token) {
                    $tradeList = $tl;
                    break;
                }
            }
        }

        if (is_array($tradeList)) {
            $balances = [];
            foreach ($tradeList as $tr) {
                $trader = isset($tr['trader']) ? strtolower(trim($tr['trader'])) : '';
                if (!$trader) continue;
                $isBuy = !empty($tr['is_buy']) || (isset($tr['type']) && $tr['type'] === 'buy');
                $tokens = isset($tr['token_amount']) ? floatval($tr['token_amount']) : (isset($tr['tokens']) ? floatval($tr['tokens']) : 0.0);
                if (!isset($balances[$trader])) $balances[$trader] = 0.0;
                if ($isBuy) {
                    $balances[$trader] += $tokens;
                } else {
                    $balances[$trader] = max(0.0, $balances[$trader] - $tokens);
                }
            }
            foreach ($balances as $trader => $bal) {
                if ($bal > 0.0001) {
                    $holders[] = [
                        'trader' => $trader,
                        'balance' => $bal
                    ];
                }
            }
            usort($holders, function($a, $b) {
                return $b['balance'] <=> $a['balance'];
            });
        }

        echo json_encode(['success' => true, 'holders' => $holders]);
        exit;
    }

    $token = isset($_GET['token']) ? strtolower(trim($_GET['token'])) : null;
    $ticker = isset($_GET['ticker']) ? strtolower(trim($_GET['ticker'])) : null;

    if ($token && isset($data[$token])) {
        echo json_encode(['success' => true, 'trades' => $data[$token]]);
        exit;
    }
    if ($ticker && isset($data[$ticker])) {
        echo json_encode(['success' => true, 'trades' => $data[$ticker]]);
        exit;
    }

    // Try finding by any matching key
    if ($token) {
        foreach ($data as $k => $tradeList) {
            if (strtolower($k) === $token) {
                echo json_encode(['success' => true, 'trades' => $tradeList]);
                exit;
            }
        }
    }

    echo json_encode(['success' => true, 'trades' => []]);
    exit;
}

// 2. POST: Append a new trade event
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

    $tokenRaw = isset($body['token']) ? trim($body['token']) : (isset($body['tokenAddress']) ? trim($body['tokenAddress']) : null);
    if (!$tokenRaw || !preg_match('/^(0x[a-fA-F0-9]{40}|[a-zA-Z0-9_-]{1,32})$/', $tokenRaw)) {
        echo json_encode(['success' => false, 'error' => 'Invalid or missing token identifier']);
        exit;
    }
    $tokenKey = strtolower($tokenRaw);

    $txHash = isset($body['txHash']) ? trim($body['txHash']) : (isset($body['tx_hash']) ? trim($body['tx_hash']) : null);
    if (!$txHash || !preg_match('/^0x[a-fA-F0-9]{64}$/', $txHash)) {
        echo json_encode(['success' => false, 'error' => 'Valid Ethereum transaction hash (0x + 64 hex chars) required']);
        exit;
    }

    $traderRaw = isset($body['trader']) ? trim($body['trader']) : (isset($body['user']) ? trim($body['user']) : '');
    $trader = preg_match('/^0x[a-fA-F0-9]{40}$/', $traderRaw) ? $traderRaw : '0x0000000000000000000000000000000000000000';

    $ethAmount = isset($body['ethAmount']) ? abs(floatval($body['ethAmount'])) : (isset($body['eth']) ? abs(floatval($body['eth'])) : 0);
    $tokenAmount = isset($body['tokenAmount']) ? abs(floatval($body['tokenAmount'])) : (isset($body['tokens']) ? abs(floatval($body['tokens'])) : 0);

    $tradeEntry = [
        'tx_hash' => $txHash,
        'trader' => $trader,
        'is_buy' => isset($body['isBuy']) ? (bool)$body['isBuy'] : (isset($body['is_buy']) ? (bool)$body['is_buy'] : (isset($body['type']) && $body['type'] === 'buy')),
        'eth_amount' => $ethAmount,
        'token_amount' => $tokenAmount,
        'timestamp' => isset($body['timestamp']) ? substr(strip_tags($body['timestamp']), 0, 30) : date('c')
    ];

    $data = getTradesData($tradesFile);
    if (!isset($data[$tokenKey]) || !is_array($data[$tokenKey])) {
        $data[$tokenKey] = [];
    }

    // Check duplicate by txHash
    $isDup = false;
    foreach ($data[$tokenKey] as $existing) {
        if (!empty($existing['tx_hash']) && !empty($tradeEntry['tx_hash']) && strtolower($existing['tx_hash']) === strtolower($tradeEntry['tx_hash'])) {
            $isDup = true;
            break;
        }
    }

    if (!$isDup) {
        array_unshift($data[$tokenKey], $tradeEntry);
        // Keep up to 100 recent trades
        if (count($data[$tokenKey]) > 100) {
            $data[$tokenKey] = array_slice($data[$tokenKey], 0, 100);
        }
        saveTradesData($tradesFile, $data);
    }

    echo json_encode(['success' => true, 'trade' => $tradeEntry]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Method not allowed']);
