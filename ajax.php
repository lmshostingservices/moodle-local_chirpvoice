<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * AI SCORM Voiceover - AJAX proxy
 *
 * Receives TTS requests from the frontend, authenticates them,
 * and proxies to the lms-labs.com/api/moodle/chirp-tts endpoint.
 *
 * FEAT-CV-TEACHER-LANG (v1.0.8): Now accepts a courseid in the POST body
 * and validates the requested language against the course-level allowed list
 * (a teacher-configured subset of the admin-allowed list) when one exists.
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/filelib.php');  // Provides Moodle's \curl class.

require_login();

header('Content-Type: application/json; charset=utf-8');

try {
    $rawbody = file_get_contents('php://input');
    $input   = json_decode($rawbody, true);

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    // sesskey arrives in the JSON body (Content-Type: application/json bypasses
    // POST body population, so require_sesskey() cannot find it). Validate manually.
    $sesskey = isset($input['sesskey']) ? (string)$input['sesskey'] : '';
    if (!confirm_sesskey($sesskey)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid session key']);
        exit;
    }

    $text     = isset($input['text'])     ? trim((string) $input['text'])     : '';
    $voice    = isset($input['voice'])    ? trim((string) $input['voice'])    : 'Aoede';
    $language = isset($input['language']) ? trim((string) $input['language']) : 'en-AU';
    $courseid = isset($input['courseid']) ? (int)$input['courseid']           : 0;

    // FEAT-CV-SPEAKINGRATE (v1.1.18): Pass speakingRate to Google TTS natively so
    // the audio is generated at the correct pace without pitch distortion.
    // Google TTS supports 0.25–2.0; clamp to a safe subset matching the UI steps.
    $speakingrate = isset($input['speakingRate']) ? (float)$input['speakingRate'] : 1.0;
    $speakingrate = max(0.25, min(2.0, $speakingrate));

    if (strlen($text) < 2) {
        echo json_encode(['ok' => false, 'error' => 'No text provided']);
        exit;
    }

    // All Chirp 3 HD personalities (master allowed set).
    $allvoices = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Orus', 'Puck', 'Zephyr'];

    // Admin-configured allowed voices (subset of all voices).
    $allowedvoicesraw = get_config('local_chirpvoice', 'allowedvoices');
    if (!empty($allowedvoicesraw)) {
        $allowedvoices = array_filter(array_map('trim', explode(',', $allowedvoicesraw)));
        // Intersect with master list to prevent spoofed values.
        $allowedvoices = array_values(array_intersect($allowedvoices, $allvoices));
    } else {
        $allowedvoices = $allvoices;
    }
    if (empty($allowedvoices)) {
        $allowedvoices = $allvoices;
    }

    if (!in_array($voice, $allowedvoices, true)) {
        // Silently fall back to first allowed voice rather than blocking playback.
        $voice = $allowedvoices[0];
    }

    // All supported language codes (master allowed set).
    $alllanguages = [
        'en-AU','en-US','en-GB','fr-FR','de-DE','es-ES','es-US','ja-JP',
        'ko-KR','pt-BR','zh-CN','zh-TW','ar-XA','hi-IN','it-IT','nl-NL',
        'pl-PL','ru-RU','sv-SE','tr-TR','uk-UA','vi-VN','th-TH','id-ID',
        'ms-MY','fil-PH','cs-CZ','da-DK','fi-FI','nb-NO','hu-HU',
    ];

    // ── Admin-allowed languages ───────────────────────────────────────────────
    $allowedlangsraw = get_config('local_chirpvoice', 'allowedlanguages');
    if (!empty($allowedlangsraw)) {
        $adminlangs = array_filter(array_map('trim', explode(',', $allowedlangsraw)));
        $adminlangs = array_values(array_intersect($adminlangs, $alllanguages));
    } else {
        $adminlangs = ['en-AU', 'en-US', 'en-GB'];
    }
    if (empty($adminlangs)) {
        $adminlangs = ['en-AU'];
    }

    // ── Course-level language restriction (teacher setting) ───────────────────
    // FEAT-CV-TEACHER-LANG (v1.0.8): If the course has teacher-configured language
    // restrictions, intersect with admin-allowed and use as the effective list.
    $effectivelangs = $adminlangs;
    if ($courseid > 1) {
        try {
            $coursesettings = $DB->get_record('local_chirpvoice_course_settings', ['courseid' => $courseid]);
            if ($coursesettings && !empty($coursesettings->allowedlanguages)) {
                $courselangs = array_filter(array_map('trim', explode(',', $coursesettings->allowedlanguages)));
                $intersected = array_values(array_intersect($courselangs, $adminlangs));
                if (!empty($intersected)) {
                    $effectivelangs = $intersected;
                }
            }
        } catch (\Throwable $e) {
            // Table not yet created — fall back to admin-allowed silently.
        }
    }

    if (!in_array($language, $effectivelangs, true)) {
        echo json_encode([
            'ok'    => false,
            'error' => 'The selected language is not available for this course. Please contact your teacher or administrator.',
        ]);
        exit;
    }

    // Get credentials from local_aiconfig or local_chirpvoice settings.
    $siteid = '';
    $apikey = '';

    $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
    if (file_exists($aiconfiglib)) {
        require_once($aiconfiglib);
        if (function_exists('local_aiconfig_get_siteid')) {
            $siteid = local_aiconfig_get_siteid();
        }
        if (function_exists('local_aiconfig_get_apikey')) {
            $apikey = local_aiconfig_get_apikey();
        }
    }

    if (empty($siteid)) {
        $siteid = get_config('local_chirpvoice', 'siteid');
    }
    if (empty($apikey)) {
        $apikey = get_config('local_chirpvoice', 'apikey');
    }

    if (empty($siteid) || empty($apikey)) {
        echo json_encode([
            'ok'    => false,
            'error' => 'AI Voiceover is not configured. Please set up your Site ID and API Key in Site Admin -> Plugins -> AI Voiceover settings (or via AI Config).',
        ]);
        exit;
    }

    $apiserver = get_config('local_chirpvoice', 'apiserver') ?: 'https://lms-labs.com';
    $apiurl    = rtrim($apiserver, '/') . '/api/moodle/chirp-tts';

    $postdata = json_encode([
        'siteId'      => $siteid,
        'apiKey'      => $apikey,
        'text'        => substr($text, 0, 4500),
        'voice'       => $voice,
        'language'    => $language,
        'speakingRate' => $speakingrate,   // FEAT-CV-SPEAKINGRATE (v1.1.18)
    ]);

    if ($postdata === false) {
        echo json_encode(['ok' => false, 'error' => 'Failed to encode request']);
        exit;
    }

    // Release session lock before long-running API call.
    \core\session\manager::write_close();

    $curl = new \curl();
    $curl->setopt([
        'CURLOPT_TIMEOUT'    => 30,
        'CURLOPT_HTTPHEADER' => ['Content-Type: application/json', 'Accept: application/json'],
    ]);

    $response = $curl->post($apiurl, $postdata);
    $httpcode  = $curl->info['http_code'];
    $curlerror = $curl->error;

    if (!empty($curlerror) || $response === false) {
        echo json_encode(['ok' => false, 'error' => 'Network error connecting to TTS service: ' . $curlerror]);
        exit;
    }

    $data = json_decode($response, true);

    if (!is_array($data)) {
        echo json_encode(['ok' => false, 'error' => 'Invalid response from TTS service (HTTP ' . $httpcode . ')']);
        exit;
    }

    // Pass through whatever the server returned (ok, audioContent, error, etc.).
    echo json_encode($data);

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
