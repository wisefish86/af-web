<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const SUPABASE_URL = 'https://jjaunlbglskpddslwegp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AKvYjBjCJIyCOwJ1M1ooqQ_dFkmSmml';
const IMAGE_LIMIT = 2 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;

function reply_json(array $data, int $status=200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bearer_token(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) reply_json(['error'=>'Нужно войти как тренер.'], 401);
    return trim($m[1]);
}

function request_json(string $url, array $headers): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false) reply_json(['error'=>'Не удалось проверить авторизацию: '.$error], 502);
    } else {
        $context = stream_context_create(['http'=>[
            'method'=>'GET',
            'timeout'=>15,
            'ignore_errors'=>true,
            'header'=>implode("\r\n", $headers)."\r\n",
        ]]);
        $body = @file_get_contents($url, false, $context);
        $status = 0;
        foreach (($http_response_header ?? []) as $line) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) $status=(int)$m[1];
        }
        if ($body === false) reply_json(['error'=>'Не удалось проверить авторизацию.'], 502);
    }
    $decoded = json_decode((string)$body, true);
    return [$status, is_array($decoded) ? $decoded : []];
}

function require_trainer(string $token): string {
    $headers = [
        'apikey: '.SUPABASE_PUBLISHABLE_KEY,
        'Authorization: Bearer '.$token,
        'Accept: application/json',
    ];
    [$userStatus,$user] = request_json(SUPABASE_URL.'/auth/v1/user', $headers);
    $userId = is_array($user) ? ($user['id'] ?? '') : '';
    if ($userStatus !== 200 || !is_string($userId) || $userId === '') reply_json(['error'=>'Сессия истекла. Войди заново.'], 401);

    $profileUrl = SUPABASE_URL.'/rest/v1/profiles?id=eq.'.rawurlencode($userId).'&select=role&limit=1';
    [$profileStatus,$profiles] = request_json($profileUrl, $headers);
    $role = ($profileStatus === 200 && isset($profiles[0]['role'])) ? (string)$profiles[0]['role'] : '';
    if ($role !== 'trainer') reply_json(['error'=>'Загрузка медиа доступна только тренеру.'], 403);
    return $userId;
}

function valid_exercise_id(string $id): bool {
    return (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $id);
}

function site_origin(): string {
    $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    if ($proto !== 'https' && $proto !== 'http') $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'fit.andreway.ru';
    return $proto.'://'.$host;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply_json(['error'=>'Method not allowed'], 405);
$token = bearer_token();
require_trainer($token);

$exerciseId = trim((string)($_POST['exercise_id'] ?? ''));
if (!valid_exercise_id($exerciseId)) reply_json(['error'=>'Некорректный ID упражнения.'], 422);

$siteRoot = dirname(__DIR__);
$mediaRoot = $siteRoot.'/media/exercises';
$action = trim((string)($_POST['action'] ?? 'upload'));

if ($action === 'delete') {
    $url = trim((string)($_POST['url'] ?? ''));
    $path = (string)(parse_url($url, PHP_URL_PATH) ?? '');
    $relative = ltrim(rawurldecode($path), '/');
    $prefix = 'media/exercises/'.$exerciseId.'/';
    if ($relative === '' || !str_starts_with($relative, $prefix) || str_contains($relative, '..') || str_contains($relative, "\0")) {
        reply_json(['error'=>'Некорректный путь к файлу.'], 422);
    }
    $target = $siteRoot.'/'.$relative;
    if (is_file($target) && !@unlink($target)) reply_json(['error'=>'Не удалось удалить файл с хостинга.'], 500);
    reply_json(['url'=>$url, 'path'=>'/'.$relative]);
}

if ($action !== 'upload') reply_json(['error'=>'Неизвестное действие.'], 422);
$kind = trim((string)($_POST['kind'] ?? ''));
if ($kind !== 'image' && $kind !== 'video') reply_json(['error'=>'Некорректный тип медиа.'], 422);
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) reply_json(['error'=>'Файл не получен.'], 422);
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    $message = in_array($code, [UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE], true)
        ? 'Файл больше допустимого размера на сервере.'
        : 'Не удалось принять файл (код '.$code.').';
    reply_json(['error'=>$message], 422);
}
$tmp = (string)($file['tmp_name'] ?? '');
$size = (int)($file['size'] ?? 0);
if (!is_uploaded_file($tmp)) reply_json(['error'=>'Некорректная загрузка файла.'], 422);

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = (string)$finfo->file($tmp);
$allowed = $kind === 'image'
    ? ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp']
    : ['video/mp4'=>'mp4','video/webm'=>'webm'];
$limit = $kind === 'image' ? IMAGE_LIMIT : VIDEO_LIMIT;
if (!isset($allowed[$mime])) reply_json(['error'=>$kind==='image'?'Поддерживаются JPG, PNG и WebP.':'Поддерживаются MP4 и WebM.'], 422);
if ($size <= 0 || $size > $limit) reply_json(['error'=>$kind==='image'?'Изображение должно быть не больше 2 МБ.':'Видео должно быть не больше 50 МБ.'], 422);

$dir = $mediaRoot.'/'.$exerciseId.'/'.$kind;
if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) reply_json(['error'=>'Не удалось создать папку для медиа.'], 500);
$filename = bin2hex(random_bytes(16)).'.'.$allowed[$mime];
$target = $dir.'/'.$filename;
if (!@move_uploaded_file($tmp, $target)) reply_json(['error'=>'Не удалось сохранить файл на хостинге.'], 500);
@chmod($target, 0644);

$relative = '/media/exercises/'.$exerciseId.'/'.$kind.'/'.$filename;
reply_json(['url'=>site_origin().$relative, 'path'=>$relative]);
